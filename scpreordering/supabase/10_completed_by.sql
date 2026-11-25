-- SPC Canteen — record which staff member completed an order
-- Paste into your EXISTING Supabase project's SQL Editor and click Run.
-- Run this AFTER 09_stripe.sql. Safe to re-run.
-- The name is snapshotted as plain text so students can read it from their
-- order row — student RLS does not allow reading another profile directly.

-- 1. Audit columns on orders --------------------------------------------------
alter table public.orders
  add column if not exists completed_by uuid references public.profiles(id),
  add column if not exists completed_by_name text,
  add column if not exists completed_at timestamptz;

-- 2. Capture the signed-in staff member when an order is completed ------------
create or replace function public.record_order_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_by := auth.uid();
    new.completed_at := now();

    select full_name
      into new.completed_by_name
      from public.profiles
     where id = auth.uid();
  end if;

  return new;
end $$;

drop trigger if exists record_order_completion on public.orders;
create trigger record_order_completion
  before update on public.orders
  for each row
  execute function public.record_order_completion();
