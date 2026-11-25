-- SPC Canteen — undo declined orders patch
-- Paste into your EXISTING Supabase project's SQL Editor and click Run.
-- Run this AFTER 06_account_access.sql. Safe to re-run.
-- Staff can restore a mistakenly declined, still-unpaid order. No time limit.

-- 1. Decline audit fields -----------------------------------------------------
alter table public.orders
  add column if not exists previous_status public.order_status,
  add column if not exists declined_at timestamptz,
  add column if not exists declined_by uuid references public.profiles(id),
  add column if not exists undone_at timestamptz,
  add column if not exists undone_by uuid references public.profiles(id);

create index if not exists orders_declined_by_idx on public.orders (declined_by);

alter table public.orders drop constraint if exists orders_previous_status_check;
alter table public.orders add constraint orders_previous_status_check
  check (previous_status is null or previous_status in ('pending', 'accepted', 'payment'));

-- 2. Staff decline: remember the exact stage before rejecting -----------------
create or replace function public.decline_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  if public.current_role() <> 'staff' then
    raise exception 'Only canteen staff can decline orders';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.payment_status <> 'unpaid' then
    raise exception 'Paid orders cannot be declined';
  end if;
  if v_order.status not in ('pending', 'accepted', 'payment') then
    raise exception 'This order can no longer be declined';
  end if;

  update public.orders
  set
    status = 'rejected',
    previous_status = v_order.status,
    declined_at = now(),
    declined_by = auth.uid(),
    undone_at = null,
    undone_by = null
  where id = p_order_id;
end $$;

-- 3. Staff undo: restore only declines made through decline_order ------------
-- Student cancellations do not set declined_by, so they stay cancelled.
create or replace function public.undo_decline(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  if public.current_role() <> 'staff' then
    raise exception 'Only canteen staff can undo a decline';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.status <> 'rejected' or v_order.payment_status <> 'unpaid' then
    raise exception 'This order can no longer be restored';
  end if;
  if v_order.previous_status is null or v_order.declined_by is null then
    raise exception 'This decline cannot be undone';
  end if;

  update public.orders
  set
    status = v_order.previous_status,
    previous_status = null,
    declined_at = null,
    declined_by = null,
    undone_at = now(),
    undone_by = auth.uid()
  where id = p_order_id;
end $$;

revoke all on function public.decline_order(uuid) from public;
revoke all on function public.decline_order(uuid) from anon, authenticated;
grant execute on function public.decline_order(uuid) to authenticated;

revoke all on function public.undo_decline(uuid) from public;
revoke all on function public.undo_decline(uuid) from anon, authenticated;
grant execute on function public.undo_decline(uuid) to authenticated;
