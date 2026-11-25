-- SPC Canteen — account activation / revocation patch
-- Paste into your EXISTING Supabase project's SQL Editor and click Run.
-- Run this AFTER 05_roles.sql. Safe to re-run.
-- Admin can activate or revoke every account, including staff and students.

create extension if not exists pgcrypto;

-- 1. Account access fields ----------------------------------------------------
alter table public.profiles
  add column if not exists is_active boolean default true,
  add column if not exists access_updated_at timestamptz,
  add column if not exists access_updated_by uuid references public.profiles(id);

update public.profiles set is_active = true where is_active is null;
alter table public.profiles alter column is_active set default true;
alter table public.profiles alter column is_active set not null;

create index if not exists profiles_active_idx on public.profiles (is_active);

-- 2. Active-aware helpers -----------------------------------------------------
create or replace function public.is_active_user(p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles
    where id = p_user_id and is_active = true
  );
$$;

-- Role checks now return no role for revoked accounts, so staff/admin policies
-- stop working immediately even if an old access token is still alive.
create or replace function public.current_role()
returns public.app_role
language sql stable security definer set search_path = public as $$
  select role
  from public.profiles
  where id = auth.uid() and is_active = true;
$$;

-- Nobody can flip is_active by editing profiles directly. The admin RPC below
-- is the only supported path.
create or replace function public.protect_account_access()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_active is distinct from old.is_active then
    if auth.uid() is null or not exists (
      select 1
      from public.profiles
      where id = auth.uid() and role = 'admin' and is_active = true
    ) then
      raise exception 'Only administrators can change account access';
    end if;

    if new.id = auth.uid() then
      raise exception 'You cannot change your own account access';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists protect_account_access on public.profiles;
create trigger protect_account_access
  before update on public.profiles
  for each row execute function public.protect_account_access();

-- 3. Admin-only activation / revocation --------------------------------------
create or replace function public.set_account_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role public.app_role;
  v_name text;
  v_active_admins integer;
begin
  if p_active is null then
    raise exception 'Choose activate or revoke';
  end if;

  if auth.uid() is null or not exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin' and is_active = true
  ) then
    raise exception 'Only administrators can change account access';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own account access';
  end if;

  select role, full_name into v_role, v_name
  from public.profiles
  where id = p_user_id;

  if not found then
    raise exception 'Account not found';
  end if;

  -- Never let the canteen lose its last working administrator.
  if p_active = false and v_role = 'admin' then
    select count(*) into v_active_admins
    from public.profiles
    where role = 'admin' and is_active = true;

    if v_active_admins <= 1 then
      raise exception 'At least one administrator must stay active';
    end if;
  end if;

  update public.profiles
  set
    is_active = p_active,
    access_updated_at = now(),
    access_updated_by = auth.uid()
  where id = p_user_id;

  if p_active then
    -- Restores sign-in. The user keeps the same ID and password.
    update auth.users
    set banned_until = null
    where id = p_user_id;
  else
    -- GoTrue refuses sign-in and token refresh while banned_until is in the future.
    update auth.users
    set banned_until = now() + interval '100 years'
    where id = p_user_id;

    -- End any current sessions so the revoke takes effect right away.
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'auth' and c.relname = 'sessions'
    ) then
      execute 'delete from auth.sessions where user_id = $1' using p_user_id;
    end if;
  end if;
end $$;

revoke all on function public.set_account_active(uuid, boolean) from public;
revoke all on function public.set_account_active(uuid, boolean) from anon, authenticated;
grant execute on function public.set_account_active(uuid, boolean) to authenticated;

-- 4. RLS hardening for revoked accounts --------------------------------------
-- Own-profile read stays open so the app can detect a revoked account and sign out.
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.current_role() in ('staff', 'admin'));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists "menu_read" on public.menu_items;
create policy "menu_read" on public.menu_items
  for select to authenticated using (public.is_active_user(auth.uid()));

drop policy if exists "daily_menu_read" on public.daily_menu;
create policy "daily_menu_read" on public.daily_menu
  for select to authenticated using (public.is_active_user(auth.uid()));

drop policy if exists "orders_read" on public.orders;
create policy "orders_read" on public.orders
  for select to authenticated
  using (
    (user_id = auth.uid() and public.is_active_user(auth.uid()))
    or public.current_role() in ('staff', 'admin')
  );

drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_active_user(auth.uid())
    and status = 'pending'
    and payment_status = 'unpaid'
  );

drop policy if exists "order_items_read" on public.order_items;
create policy "order_items_read" on public.order_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_id
        and (
          (o.user_id = auth.uid() and public.is_active_user(auth.uid()))
          or public.current_role() in ('staff', 'admin')
        )
    )
  );

drop policy if exists "order_items_insert_own" on public.order_items;
create policy "order_items_insert_own" on public.order_items
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.orders o
      where o.id = order_id
        and o.user_id = auth.uid()
        and o.status = 'pending'
        and public.is_active_user(auth.uid())
    )
  );

drop policy if exists "payments_read" on public.payments;
create policy "payments_read" on public.payments
  for select to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_id
        and (
          (o.user_id = auth.uid() and public.is_active_user(auth.uid()))
          or public.current_role() in ('staff', 'admin')
        )
    )
  );
