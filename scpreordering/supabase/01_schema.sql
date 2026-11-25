-- SPC Canteen Pre-Ordering System
-- Paste this file into the Supabase SQL Editor and click Run.
-- Safe to re-run: objects use IF NOT EXISTS / DROP ... IF EXISTS.

create extension if not exists pgcrypto;

-- Find where pgcrypto lives (Supabase puts it in "extensions") ---------------
create or replace function public.hash_password(p_password text)
returns text
language plpgsql
stable
as $$
declare
  v_schema text;
  v_hash text;
begin
  select n.nspname into v_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if v_schema is null then
    raise exception 'pgcrypto extension is missing';
  end if;

  execute format('select %I.crypt($1, %I.gen_salt($2))', v_schema, v_schema)
    into v_hash using p_password, 'bf';
  return v_hash;
end $$;

-- Roles and order stages -----------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('student', 'staff', 'admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum
      ('pending', 'accepted', 'payment', 'preparing', 'ready', 'completed', 'rejected');
  end if;
end $$;

-- Departments -----------------------------------------------------------------
-- Students pick one at signup; staff and admin do not need one.
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique
);

-- Tables ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  student_id text unique,          -- the School ID (YYYY-NNNNN), staff ID, or "admin"
  full_name text not null,
  role public.app_role not null default 'student',
  department_id uuid references public.departments(id),
  created_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  category text not null default 'Main',
  price numeric(10, 2) not null check (price >= 0),
  emoji text not null default '🍱',
  image_url text,
  available boolean not null default true,
  stock integer not null default 0 check (stock >= 0),
  created_at timestamptz not null default now()
);

-- Today's board. Staff edit these rows; menu_items stays the master list.
create table if not exists public.daily_menu (
  id uuid primary key default gen_random_uuid(),
  menu_date date not null default current_date,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  available boolean not null default true,
  stock integer not null default 0 check (stock >= 0),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (menu_date, menu_item_id)
);

create unique index if not exists daily_menu_date_item_idx
  on public.daily_menu (menu_date, menu_item_id);
create index if not exists daily_menu_date_idx on public.daily_menu (menu_date);

-- Retire the old generated-student-ID helper if an older version was run.
drop function if exists public.next_canteen_id();
drop sequence if exists public.canteen_id_seq;

create sequence if not exists public.order_number_seq start 1001;
create sequence if not exists public.staff_id_seq start 1;

create or replace function public.new_order_number()
returns text language sql volatile as $$
  select 'SPC-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 4, '0');
$$;

create or replace function public.next_staff_id()
returns text language sql volatile security definer set search_path = public as $$
  select 'ST-' || lpad(nextval('public.staff_id_seq')::text, 4, '0');
$$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default public.new_order_number(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.order_status not null default 'pending',
  pickup_time timestamptz not null,
  total numeric(10, 2) not null check (total >= 0),
  notes text,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id),
  name_snapshot text not null,
  emoji_snapshot text not null default '🍱',
  unit_price numeric(10, 2) not null,
  quantity integer not null check (quantity > 0),
  notes text
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  amount numeric(10, 2) not null,
  method text not null default 'demo',
  status text not null default 'pending',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists orders_user_idx on public.orders (user_id);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- Shared helpers -------------------------------------------------------------
create or replace function public.current_role()
returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

-- New users get their School ID and department from signup metadata.
-- "canteen_id" is kept as a fallback for accounts made by the old scripts.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_id text := coalesce(
    nullif(new.raw_user_meta_data ->> 'school_id', ''),
    nullif(new.raw_user_meta_data ->> 'canteen_id', ''),
    split_part(new.email, '@', 1)
  );
  v_dept_code text := nullif(new.raw_user_meta_data ->> 'department_code', '');
  v_dept_id uuid;
begin
  if v_id !~ '^(\d{4}-\d{5}|ST-\d{4}|admin)$' then
    raise exception 'Invalid ID format. Use YYYY-NNNNN.';
  end if;

  if exists (select 1 from public.profiles where student_id = v_id) then
    raise exception 'That School ID is already registered';
  end if;

  if v_dept_code is not null then
    select id into v_dept_id from public.departments where code = v_dept_code;
  end if;

  insert into public.profiles (id, full_name, student_id, department_id)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), v_id),
    v_id,
    v_dept_id
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.protect_role()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and public.current_role() <> 'admin' then
    raise exception 'Only administrators can change roles';
  end if;
  return new;
end $$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_role();

-- Staff no longer touch the master menu; they edit public.daily_menu instead.
create or replace function public.protect_menu_item()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.current_role() = 'staff' then
    raise exception 'Staff edit the daily board, not the master menu';
  end if;
  return new;
end $$;

drop trigger if exists protect_menu_edits on public.menu_items;
create trigger protect_menu_edits
  before update on public.menu_items
  for each row execute function public.protect_menu_item();

-- Admin creates canteen staff accounts from inside the app -------------------
create or replace function public.create_staff_account(p_full_name text, p_password text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := gen_random_uuid();
  v_staff_id text;
  v_email text;
begin
  if public.current_role() <> 'admin' then
    raise exception 'Only administrators can create staff accounts';
  end if;
  if nullif(trim(p_full_name), '') is null then
    raise exception 'Enter the staff member name';
  end if;
  if length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  v_staff_id := public.next_staff_id();
  v_email := v_staff_id || '@spc.test';

  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'That staff ID is already in use';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    v_email, public.hash_password(p_password), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', trim(p_full_name), 'school_id', v_staff_id),
    '', '', '', ''
  );

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  values (
    gen_random_uuid(), v_user_id::text, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
    'email', now(), now(), now()
  )
  on conflict do nothing;

  update public.profiles
  set role = 'staff', full_name = trim(p_full_name)
  where id = v_user_id;

  return v_staff_id;
end $$;

-- Demo payment: no gateway, no keys ------------------------------------------
create or replace function public.simulate_payment(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_total numeric(10, 2);
begin
  select user_id, total into v_user, v_total
  from public.orders
  where id = p_order_id and status = 'payment' and payment_status = 'unpaid';

  if v_user is null or v_user <> auth.uid() then
    raise exception 'Order is not waiting for payment';
  end if;

  insert into public.payments (order_id, amount, method, status, verified_at)
  values (p_order_id, v_total, 'demo', 'paid', now())
  on conflict (order_id) do update set status = 'paid', verified_at = now();

  update public.orders
  set status = 'preparing', payment_status = 'paid', updated_at = now()
  where id = p_order_id;
end $$;

create or replace function public.cancel_own_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orders
  set status = 'rejected', updated_at = now()
  where id = p_order_id
    and user_id = auth.uid()
    and status = 'pending'
    and payment_status = 'unpaid';
end $$;

grant select on public.departments to anon, authenticated;
grant execute on function public.simulate_payment(uuid) to authenticated;
grant execute on function public.cancel_own_order(uuid) to authenticated;
grant execute on function public.next_staff_id() to authenticated;
grant execute on function public.create_staff_account(text, text) to authenticated;
grant usage on sequence public.order_number_seq to authenticated;

-- Row Level Security ---------------------------------------------------------
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.menu_items enable row level security;
alter table public.daily_menu enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;

drop policy if exists "departments_read" on public.departments;
create policy "departments_read" on public.departments
  for select to anon, authenticated using (true);

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
  for select to authenticated using (true);

drop policy if exists "menu_insert_admin" on public.menu_items;
create policy "menu_insert_admin" on public.menu_items
  for insert to authenticated with check (public.current_role() = 'admin');

drop policy if exists "menu_update_staff" on public.menu_items;
drop policy if exists "menu_update_admin" on public.menu_items;
create policy "menu_update_admin" on public.menu_items
  for update to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists "menu_delete_admin" on public.menu_items;
create policy "menu_delete_admin" on public.menu_items
  for delete to authenticated using (public.current_role() = 'admin');

drop policy if exists "daily_menu_read" on public.daily_menu;
create policy "daily_menu_read" on public.daily_menu
  for select to authenticated using (true);

drop policy if exists "daily_menu_insert_staff" on public.daily_menu;
create policy "daily_menu_insert_staff" on public.daily_menu
  for insert to authenticated
  with check (public.current_role() in ('staff', 'admin'));

drop policy if exists "daily_menu_update_staff" on public.daily_menu;
create policy "daily_menu_update_staff" on public.daily_menu
  for update to authenticated
  using (public.current_role() in ('staff', 'admin'))
  with check (public.current_role() in ('staff', 'admin'));

drop policy if exists "daily_menu_delete_staff" on public.daily_menu;
create policy "daily_menu_delete_staff" on public.daily_menu
  for delete to authenticated
  using (public.current_role() in ('staff', 'admin'));

drop policy if exists "orders_read" on public.orders;
create policy "orders_read" on public.orders
  for select to authenticated
  using (user_id = auth.uid() or public.current_role() in ('staff', 'admin'));

drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and payment_status = 'unpaid');

drop policy if exists "orders_update_staff" on public.orders;
create policy "orders_update_staff" on public.orders
  for update to authenticated
  using (public.current_role() in ('staff', 'admin'))
  with check (public.current_role() in ('staff', 'admin'));

drop policy if exists "order_items_read" on public.order_items;
create policy "order_items_read" on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.user_id = auth.uid() or public.current_role() in ('staff', 'admin'))
    )
  );

drop policy if exists "order_items_insert_own" on public.order_items;
create policy "order_items_insert_own" on public.order_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid() and o.status = 'pending'
    )
  );

drop policy if exists "payments_read" on public.payments;
create policy "payments_read" on public.payments
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.user_id = auth.uid() or public.current_role() in ('staff', 'admin'))
    )
  );

-- Storage: public food photos, admin-only uploads ----------------------------
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

drop policy if exists "menu_photos_public" on storage.objects;
create policy "menu_photos_public" on storage.objects
  for select to public using (bucket_id = 'menu-images');

drop policy if exists "menu_photos_admin_insert" on storage.objects;
create policy "menu_photos_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu-images' and public.current_role() = 'admin');

drop policy if exists "menu_photos_admin_update" on storage.objects;
create policy "menu_photos_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'menu-images' and public.current_role() = 'admin');

drop policy if exists "menu_photos_admin_delete" on storage.objects;
create policy "menu_photos_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu-images' and public.current_role() = 'admin');

-- Realtime: students watch their order move through the queue ----------------
alter table public.orders replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.orders;
exception when others then
  null; -- already published
end $$;
