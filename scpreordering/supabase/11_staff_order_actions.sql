-- SPC Canteen — staff undo and delete for orders
-- Paste into your EXISTING Supabase project's SQL Editor and click Run.
-- Run this AFTER 10_completed_by.sql. Safe to re-run.
-- Undo restores the staff member's last status change. Delete is limited to
-- unpaid orders so sales, stock consumption, and receipts stay intact.

-- 1. Status-change audit fields ------------------------------------------------
alter table public.orders
  add column if not exists last_status public.order_status,
  add column if not exists status_changed_by uuid references public.profiles(id),
  add column if not exists status_changed_at timestamptz;

-- 2. Staff-only status change --------------------------------------------------
create or replace function public.set_order_status(
  p_order_id uuid,
  p_status public.order_status
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  if auth.uid() is null then
    raise exception 'Sign in to update orders';
  end if;
  if public.current_role() <> 'staff' or not public.is_active_user(auth.uid()) then
    raise exception 'Only active canteen staff can update orders';
  end if;
  if p_status is null then
    raise exception 'A status is required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.status = p_status then
    return;
  end if;
  if p_status = 'rejected' then
    raise exception 'Use Decline for rejected orders';
  end if;
  if p_status in ('preparing', 'ready', 'completed')
     and v_order.payment_status <> 'paid' then
    raise exception 'Confirm payment before the order can be prepared or collected';
  end if;

  update public.orders
  set
    last_status = v_order.status,
    status = p_status,
    status_changed_by = auth.uid(),
    status_changed_at = now(),
    updated_at = now()
  where id = p_order_id;
end $$;

-- 3. Staff-only undo of the last status change --------------------------------
create or replace function public.undo_status_change(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  if auth.uid() is null then
    raise exception 'Sign in to update orders';
  end if;
  if public.current_role() <> 'staff' or not public.is_active_user(auth.uid()) then
    raise exception 'Only active canteen staff can update orders';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.last_status is null then
    raise exception 'There is no recent status change to undo';
  end if;
  if v_order.status = 'rejected' or v_order.last_status = 'rejected' then
    raise exception 'Use Undo decline for declined orders';
  end if;

  update public.orders
  set
    status = v_order.last_status,
    last_status = null,
    status_changed_by = auth.uid(),
    status_changed_at = now(),
    completed_by = case when v_order.status = 'completed' then null else completed_by end,
    completed_by_name = case when v_order.status = 'completed' then null else completed_by_name end,
    completed_at = case when v_order.status = 'completed' then null else completed_at end,
    updated_at = now()
  where id = p_order_id;
end $$;

-- 4. Staff-only delete, unpaid orders only ------------------------------------
create or replace function public.delete_order_staff(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  if auth.uid() is null then
    raise exception 'Sign in to delete orders';
  end if;
  if public.current_role() <> 'staff' or not public.is_active_user(auth.uid()) then
    raise exception 'Only active canteen staff can delete orders';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.payment_status <> 'unpaid' then
    raise exception 'Paid orders cannot be deleted. Sales and stock records are kept.';
  end if;

  delete from public.orders where id = p_order_id;
end $$;

-- 5. Permissions ---------------------------------------------------------------
revoke all on function public.set_order_status(uuid, public.order_status) from public;
revoke all on function public.set_order_status(uuid, public.order_status) from anon, authenticated;
grant execute on function public.set_order_status(uuid, public.order_status) to authenticated;

revoke all on function public.undo_status_change(uuid) from public;
revoke all on function public.undo_status_change(uuid) from anon, authenticated;
grant execute on function public.undo_status_change(uuid) to authenticated;

revoke all on function public.delete_order_staff(uuid) from public;
revoke all on function public.delete_order_staff(uuid) from anon, authenticated;
grant execute on function public.delete_order_staff(uuid) to authenticated;
