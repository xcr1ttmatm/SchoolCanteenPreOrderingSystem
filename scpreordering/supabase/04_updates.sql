-- SPC Canteen — college update patch
-- Paste this into your EXISTING Supabase project's SQL Editor and click Run.
-- It is safe to re-run: everything uses IF NOT EXISTS / DROP ... IF EXISTS.
-- This adds School ID signup, departments, and the daily menu board.

create extension if not exists pgcrypto;

-- 1. Departments --------------------------------------------------------------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique
);

insert into public.departments (code, name) values
  ('ED',   'College of Education'),
  ('CRIM', 'College of Criminology'),
  ('CAS',  'College of Arts and Sciences'),
  ('CCS',  'College of Computer Studies'),
  ('CBA',  'College of Business Administration'),
  ('ENG',  'College of Engineering')
on conflict (code) do nothing;

-- 2. Link profiles to a department --------------------------------------------
alter table public.profiles
  add column if not exists department_id uuid references public.departments(id);

-- 3. Daily board --------------------------------------------------------------
-- One shared board for the whole canteen. Staff edit today's rows only.
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

-- 4. New signups use the School ID they type, plus their department -----------
-- The old "canteen_id" metadata key is kept as a fallback for older accounts.
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

-- 5. Retire the generated-student-ID helper -----------------------------------
drop function if exists public.next_canteen_id();
drop sequence if exists public.canteen_id_seq;

-- 6. Staff metadata uses "school_id"; staff cannot edit the master menu -------
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

create or replace function public.protect_menu_item()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.current_role() = 'staff' then
    raise exception 'Staff edit the daily board, not the master menu';
  end if;
  return new;
end $$;

-- 7. Row Level Security for the new tables ------------------------------------
alter table public.departments enable row level security;
alter table public.daily_menu enable row level security;

drop policy if exists "departments_read" on public.departments;
create policy "departments_read" on public.departments
  for select to anon, authenticated using (true);

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

-- Only admins edit the master list now; staff use the daily board.
drop policy if exists "menu_update_staff" on public.menu_items;
drop policy if exists "menu_update_admin" on public.menu_items;
create policy "menu_update_admin" on public.menu_items
  for update to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

grant select on public.departments to anon, authenticated;
