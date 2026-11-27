-- SPC Canteen — staff-controlled counter open/closed status
-- Paste into your EXISTING Supabase project's SQL Editor and click Run.
-- Run this AFTER 15_cash_close_schedule.sql. Safe to re-run.
-- This is additive: you do NOT need to rerun 01–15.
-- Closing the counter stops NEW orders. Orders already placed can still be
-- paid and worked on normally, so nobody loses a basket or a paid order.

-- 1. Singleton counter status row ----------------------------------------------
create table if not exists public.canteen_status (
  id boolean primary key default true check (id),
  is_open boolean not null default true,
  reason text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.canteen_status (id, is_open, reason)
values (true, true, null)
on conflict (id) do nothing;

alter table public.canteen_status enable row level security;

drop policy if exists "canteen_status_read" on public.canteen_status;
create policy "canteen_status_read" on public.canteen_status
  for select to authenticated using (true);

-- Only the RPC below may change the row; clients never write it directly.
revoke all on table public.canteen_status from public, anon, authenticated;
grant select on table public.canteen_status to authenticated;

-- 2. Staff/admin RPC ------------------------------------------------------------
create or replace function public.set_canteen_status(
  p_is_open boolean,
  p_reason text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_is_open is null then
    raise exception 'Choose open or closed';
  end if;
  if public.current_role() not in ('staff', 'admin')
     or not public.is_active_user(auth.uid()) then
    raise exception 'Only active canteen staff or admins can change the counter status';
  end if;

  insert into public.canteen_status (id, is_open, reason, updated_at, updated_by)
  values (
    true,
    p_is_open,
    nullif(btrim(coalesce(p_reason, '')), ''),
    now(),
    auth.uid()
  )
  on conflict (id) do update
    set is_open = excluded.is_open,
        reason = excluded.reason,
        updated_at = now(),
        updated_by = auth.uid();
end $$;

revoke all on function public.set_canteen_status(boolean, text) from public;
revoke all on function public.set_canteen_status(boolean, text) from anon, authenticated;
grant execute on function public.set_canteen_status(boolean, text) to authenticated;

-- 3. Block new orders while closed ---------------------------------------------
-- Same order placement as 05_roles.sql, with one extra guard near the top.
-- Existing unpaid/paid orders are untouched.
create or replace function public.place_order(
  p_pickup_time timestamptz,
  p_notes text,
  p_method text,
  p_items jsonb
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_qty integer;
  v_price numeric(10, 2);
  v_name text;
  v_emoji text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to place an order';
  end if;
  if not coalesce((select is_open from public.canteen_status where id = true), true) then
    raise exception 'The canteen counter is closed right now. Please try again when staff reopen it.';
  end if;
  if p_method not in ('online', 'cash') then
    raise exception 'Choose online or cash payment';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Your basket is empty';
  end if;

  insert into public.orders (user_id, pickup_time, total, notes, payment_method)
  values (
    auth.uid(),
    p_pickup_time,
    0,
    nullif(trim(coalesce(p_notes, '')), ''),
    p_method
  )
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_item ->> 'id')::uuid;
    v_qty := (v_item ->> 'quantity')::integer;

    if v_qty is null or v_qty < 1 then
      raise exception 'Invalid quantity in basket';
    end if;

    select price, name, emoji into v_price, v_name, v_emoji
    from public.menu_items
    where id = v_item_id;

    if not found then
      raise exception 'An item in your basket is no longer on the menu';
    end if;

    insert into public.order_items (
      order_id, menu_item_id, name_snapshot, emoji_snapshot, unit_price, quantity
    )
    values (v_order_id, v_item_id, v_name, v_emoji, v_price, v_qty);
  end loop;

  update public.orders
  set total = (
    select coalesce(sum(unit_price * quantity), 0)
    from public.order_items
    where order_id = v_order_id
  )
  where id = v_order_id;

  return v_order_id;
end $$;

revoke all on function public.place_order(timestamptz, text, text, jsonb) from public;
revoke all on function public.place_order(timestamptz, text, text, jsonb) from anon;
grant execute on function public.place_order(timestamptz, text, text, jsonb) to authenticated;

-- 4. Live banner updates --------------------------------------------------------
alter table public.canteen_status replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.canteen_status;
exception when others then null;
end $$;
