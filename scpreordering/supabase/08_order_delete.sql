-- SPC Canteen — student order deletion patch
-- Paste into your EXISTING Supabase project's SQL Editor and click Run.
-- Run this AFTER 07_undo_decline.sql. Safe to re-run.
-- Unpaid orders are removed. Paid orders are hidden from the student only.

-- 1. Student-delete audit fields ----------------------------------------------
alter table public.orders
  add column if not exists student_deleted_at timestamptz,
  add column if not exists student_deleted_by uuid references public.profiles(id) on delete set null;

create index if not exists orders_student_deleted_idx
  on public.orders (user_id, student_deleted_at);

-- 2. Owner-only delete/hide RPC -----------------------------------------------
create or replace function public.delete_own_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  if auth.uid() is null then
    raise exception 'Sign in to delete an order';
  end if;
  if not public.is_active_user(auth.uid()) then
    raise exception 'This account cannot change orders';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.user_id <> auth.uid() then
    raise exception 'Order not found';
  end if;
  if v_order.student_deleted_at is not null then
    raise exception 'Order already deleted';
  end if;

  if v_order.payment_status = 'unpaid' then
    -- Nothing was paid or consumed, so the whole order can disappear.
    delete from public.orders where id = p_order_id;
  else
    -- Keep the sale, payment, and stock record for the canteen.
    update public.orders
    set
      student_deleted_at = now(),
      student_deleted_by = auth.uid()
    where id = p_order_id;
  end if;
end $$;

revoke all on function public.delete_own_order(uuid) from public;
revoke all on function public.delete_own_order(uuid) from anon, authenticated;
grant execute on function public.delete_own_order(uuid) to authenticated;
