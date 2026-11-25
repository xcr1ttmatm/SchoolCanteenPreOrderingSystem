-- Creates the first administrator account, then promotes it.
-- Paste into SQL Editor and Run AFTER 01_schema.sql.
-- CHANGE THE PASSWORD BELOW before running, then remember it.
-- Login ID: admin

do $$
declare
  v_admin_password text := 'Admin123!'; -- <-- CHANGE THIS
  v_admin_id uuid := gen_random_uuid();
  v_email text := 'admin@spc.test';
begin
  if not exists (select 1 from auth.users where email = v_email) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    values (
      '00000000-0000-0000-0000-000000000000', v_admin_id, 'authenticated', 'authenticated',
      v_email, public.hash_password(v_admin_password), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'Administrator', 'school_id', 'admin'),
      '', '', '', ''
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(), v_admin_id::text, v_admin_id,
      jsonb_build_object('sub', v_admin_id::text, 'email', v_email),
      'email', now(), now(), now()
    )
    on conflict do nothing;
  end if;

  update public.profiles
  set role = 'admin', full_name = 'Administrator'
  where student_id = 'admin';
end $$;
