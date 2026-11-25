-- SPC Canteen — cash pickup wait window
-- Paste into your EXISTING Supabase project's SQL Editor and click Run.
-- Run this AFTER 12_notifications.sql, then run 14_cash_notifications.sql and
-- 15_cash_close_schedule.sql. Safe to re-run.
-- This is additive: you do NOT need to rerun 01–12.
-- Cash orders stay open for 1 hour. Staff may cancel or release a still-unpaid
-- cash order after 15 minutes; unpaid orders still open at 60 minutes close
-- automatically. No stock was reserved, so released portions need no restore.

-- 1. Cash window fields -------------------------------------------------------
alter table public.orders
  add column if not exists cash_hold_until timestamptz,
  add column if not exists cash_closed_at timestamptz,
  add column if not exists cash_closed_by uuid references public.profiles(id) on delete set null,
  add column if not exists cash_close_reason text;

alter table public.orders drop constraint if exists orders_cash_close_reason_check;
alter table public.orders add constraint orders_cash_close_reason_check
  check (
    cash_close_reason is null
    or cash_close_reason in ('cancelled_no_show', 'released_no_show', 'expired')
  );

create index if not exists orders_cash_hold_idx
  on public.orders (cash_hold_until)
  where payment_method = 'cash' and payment_status = 'unpaid';

-- 2. Give every cash order a 1-hour hold from placement -----------------------
create or replace function public.set_cash_hold_window()
returns trigger
language plpgsql
as $$
begin
  if new.payment_method = 'cash' and new.cash_hold_until is null then
    new.cash_hold_until := coalesce(new.created_at, now()) + interval '1 hour';
  end if;
  return new;
end $$;

drop trigger if exists set_cash_hold_window on public.orders;
create trigger set_cash_hold_window
  before insert on public.orders
  for each row
  execute function public.set_cash_hold_window();

-- 3. Staff cancel / release after 15 minutes ---------------------------------
create or replace function public.release_cash_order(
  p_order_id uuid,
  p_action text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to update orders';
  end if;
  if public.current_role() <> 'staff' or not public.is_active_user(auth.uid()) then
    raise exception 'Only active canteen staff can release cash orders';
  end if;
  if p_action not in ('cancel', 'release') then
    raise exception 'Choose cancel or release';
  end if;

  v_reason := case p_action
    when 'cancel' then 'cancelled_no_show'
    else 'released_no_show'
  end;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.payment_method <> 'cash' then
    raise exception 'Only cash orders have a pickup wait window';
  end if;
  if v_order.payment_status <> 'unpaid' then
    raise exception 'Paid orders cannot be released';
  end if;
  if v_order.status not in ('pending', 'accepted', 'payment') then
    raise exception 'This order is already closed';
  end if;
  if v_order.cash_hold_until is null then
    raise exception 'This order has no cash pickup window';
  end if;
  if now() < v_order.created_at + interval '15 minutes' then
    raise exception 'Wait 15 minutes before cancelling or releasing a cash order';
  end if;
  if now() >= v_order.cash_hold_until then
    raise exception 'This cash order has expired';
  end if;

  update public.orders
  set
    status = 'rejected',
    cash_closed_at = now(),
    cash_closed_by = auth.uid(),
    cash_close_reason = v_reason,
    previous_status = null,
    declined_at = null,
    declined_by = null,
    undone_at = null,
    undone_by = null,
    updated_at = now()
  where id = p_order_id;
end $$;

-- 4. Auto-close at 60 minutes -------------------------------------------------
create or replace function public.close_expired_cash_orders()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  with stale as (
    select id
    from public.orders
    where payment_method = 'cash'
      and payment_status = 'unpaid'
      and status in ('pending', 'accepted', 'payment')
      and cash_hold_until is not null
      and cash_hold_until <= now()
    for update
  )
  update public.orders o
  set
    status = 'rejected',
    cash_closed_at = now(),
    cash_close_reason = 'expired',
    previous_status = null,
    declined_at = null,
    declined_by = null,
    undone_at = null,
    undone_by = null,
    updated_at = now()
  from stale
  where o.id = stale.id;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- 5. Block cash collection after the window closes ----------------------------
create or replace function public.collect_cash(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  if public.current_role() <> 'staff' then
    raise exception 'Only canteen staff can collect cash';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.payment_method <> 'cash' then
    raise exception 'This is an online order';
  end if;
  if v_order.payment_status <> 'unpaid' then
    raise exception 'This order is already paid';
  end if;
  if v_order.status not in ('pending', 'accepted', 'payment') then
    raise exception 'This order can no longer be paid';
  end if;
  if v_order.cash_hold_until is not null and now() >= v_order.cash_hold_until then
    raise exception 'The cash pickup window has closed';
  end if;

  perform public.settle_order(p_order_id, 'cash');
end $$;

-- 6. Permissions ---------------------------------------------------------------
revoke all on function public.release_cash_order(uuid, text) from public;
revoke all on function public.release_cash_order(uuid, text) from anon, authenticated;
grant execute on function public.release_cash_order(uuid, text) to authenticated;

revoke all on function public.close_expired_cash_orders() from public;
revoke all on function public.close_expired_cash_orders() from anon, authenticated;
grant execute on function public.close_expired_cash_orders() to service_role;
