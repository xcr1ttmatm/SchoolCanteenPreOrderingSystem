-- SPC Canteen — roles, payments and live stock patch
-- Paste into your EXISTING Supabase project's SQL Editor and click Run.
-- Run this AFTER 04_updates.sql. Safe to re-run.
-- Admin: accounts only. Staff: menu, daily board, sales and order stages.

create extension if not exists pgcrypto;

-- 1. Payment method on orders -------------------------------------------------
alter table public.orders
  add column if not exists payment_method text not null default 'online'
    check (payment_method in ('online', 'cash'));

-- 2. Stock check when an order is placed (no reservation, no deduction) -------
create or replace function public.check_order_stock()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_available boolean;
  v_remaining integer;
begin
  select available, stock into v_available, v_remaining
  from public.daily_menu
  where menu_date = current_date and menu_item_id = new.menu_item_id;

  if not found then
    select available, stock into v_available, v_remaining
    from public.menu_items
    where id = new.menu_item_id;
  end if;

  if not coalesce(v_available, false) then
    raise exception '% is not available today', new.name_snapshot;
  end if;
  if coalesce(v_remaining, 0) < new.quantity then
    raise exception 'Not enough portions left for %', new.name_snapshot;
  end if;

  return new;
end $$;

drop trigger if exists check_order_stock on public.order_items;
create trigger check_order_stock
  before insert on public.order_items
  for each row execute function public.check_order_stock();

-- 3. Atomic order placement: order + items in one transaction -----------------
-- The client sends only item ids and quantities; prices come from the database.
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

-- 4. Pay for an order: checks live stock and consumes it atomically -----------
-- Locked in menu-item order so simultaneous payments cannot both claim a portion.
create or replace function public.settle_order(p_order_id uuid, p_method text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_item record;
  v_available boolean;
  v_remaining integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.payment_status <> 'unpaid' then
    raise exception 'This order is already paid';
  end if;
  if v_order.status not in ('pending', 'accepted', 'payment') then
    raise exception 'This order can no longer be paid';
  end if;

  for v_item in
    select menu_item_id, name_snapshot, quantity
    from public.order_items
    where order_id = p_order_id
    order by menu_item_id
  loop
    -- First sale of the day materialises the board from the master menu.
    insert into public.daily_menu (menu_date, menu_item_id, available, stock)
    select current_date, mi.id, mi.available, mi.stock
    from public.menu_items mi
    where mi.id = v_item.menu_item_id
    on conflict (menu_date, menu_item_id) do nothing;

    select available, stock into v_available, v_remaining
    from public.daily_menu
    where menu_date = current_date and menu_item_id = v_item.menu_item_id
    for update;

    if not coalesce(v_available, false) then
      raise exception '% is not available today', v_item.name_snapshot;
    end if;
    if coalesce(v_remaining, 0) < v_item.quantity then
      raise exception 'Not enough portions left for %. Cancel this order and order again.', v_item.name_snapshot;
    end if;

    update public.daily_menu
    set stock = stock - v_item.quantity, updated_at = now()
    where menu_date = current_date and menu_item_id = v_item.menu_item_id;
  end loop;

  insert into public.payments (order_id, amount, method, status, verified_at)
  values (p_order_id, v_order.total, p_method, 'paid', now())
  on conflict (order_id) do update
    set method = excluded.method, status = 'paid', verified_at = now();

  update public.orders
  set status = 'preparing', payment_status = 'paid', updated_at = now()
  where id = p_order_id;
end $$;

-- Student pays online (demo); staff collects cash at the counter --------------
create or replace function public.pay_online(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_method text;
begin
  select payment_method into v_method
  from public.orders
  where id = p_order_id and user_id = auth.uid();

  if v_method is null then
    raise exception 'Order not found';
  end if;
  if v_method <> 'online' then
    raise exception 'This is a cash order — pay at the canteen counter';
  end if;

  perform public.settle_order(p_order_id, 'online');
end $$;

create or replace function public.collect_cash(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_method text;
begin
  if public.current_role() <> 'staff' then
    raise exception 'Only canteen staff can collect cash';
  end if;

  select payment_method into v_method from public.orders where id = p_order_id;
  if v_method is null then
    raise exception 'Order not found';
  end if;
  if v_method <> 'cash' then
    raise exception 'This is an online order';
  end if;

  perform public.settle_order(p_order_id, 'cash');
end $$;

-- Clients may never call the internal settlement helper directly.
revoke all on function public.settle_order(uuid, text) from public;
revoke all on function public.settle_order(uuid, text) from anon, authenticated;

-- Unpaid orders can be cancelled in any pre-payment stage.
create or replace function public.cancel_own_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orders
  set status = 'rejected', updated_at = now()
  where id = p_order_id
    and user_id = auth.uid()
    and payment_status = 'unpaid'
    and status in ('pending', 'accepted', 'payment');
end $$;

drop function if exists public.simulate_payment(uuid);

grant execute on function public.place_order(timestamptz, text, text, jsonb) to authenticated;
grant execute on function public.pay_online(uuid) to authenticated;
grant execute on function public.collect_cash(uuid) to authenticated;
grant execute on function public.cancel_own_order(uuid) to authenticated;

-- 5. Staff own the menu; admin only monitors accounts -------------------------
-- Master availability/stock belong to today's board, so no staff block here.
drop trigger if exists protect_menu_edits on public.menu_items;
drop function if exists public.protect_menu_item();

drop policy if exists "menu_insert_admin" on public.menu_items;
drop policy if exists "menu_insert_staff" on public.menu_items;
create policy "menu_insert_staff" on public.menu_items
  for insert to authenticated with check (public.current_role() = 'staff');

drop policy if exists "menu_update_staff" on public.menu_items;
drop policy if exists "menu_update_admin" on public.menu_items;
create policy "menu_update_staff" on public.menu_items
  for update to authenticated
  using (public.current_role() = 'staff')
  with check (public.current_role() = 'staff');

drop policy if exists "menu_delete_admin" on public.menu_items;
drop policy if exists "menu_delete_staff" on public.menu_items;
create policy "menu_delete_staff" on public.menu_items
  for delete to authenticated using (public.current_role() = 'staff');

drop policy if exists "menu_photos_admin_insert" on storage.objects;
drop policy if exists "menu_photos_staff_insert" on storage.objects;
create policy "menu_photos_staff_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu-images' and public.current_role() = 'staff');

drop policy if exists "menu_photos_admin_update" on storage.objects;
drop policy if exists "menu_photos_staff_update" on storage.objects;
create policy "menu_photos_staff_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'menu-images' and public.current_role() = 'staff');

drop policy if exists "menu_photos_admin_delete" on storage.objects;
drop policy if exists "menu_photos_staff_delete" on storage.objects;
create policy "menu_photos_staff_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu-images' and public.current_role() = 'staff');

-- Only staff act on orders; admin watches accounts, not the queue.
drop policy if exists "orders_update_staff" on public.orders;
create policy "orders_update_staff" on public.orders
  for update to authenticated
  using (public.current_role() = 'staff')
  with check (public.current_role() = 'staff');

-- Only staff change today's board.
drop policy if exists "daily_menu_insert_staff" on public.daily_menu;
drop policy if exists "daily_menu_insert_admin" on public.daily_menu;
create policy "daily_menu_insert_staff" on public.daily_menu
  for insert to authenticated with check (public.current_role() = 'staff');

drop policy if exists "daily_menu_update_staff" on public.daily_menu;
drop policy if exists "daily_menu_update_admin" on public.daily_menu;
create policy "daily_menu_update_staff" on public.daily_menu
  for update to authenticated
  using (public.current_role() = 'staff')
  with check (public.current_role() = 'staff');

drop policy if exists "daily_menu_delete_staff" on public.daily_menu;
drop policy if exists "daily_menu_delete_admin" on public.daily_menu;
create policy "daily_menu_delete_staff" on public.daily_menu
  for delete to authenticated using (public.current_role() = 'staff');

-- 6. Realtime stock quantities -------------------------------------------------
alter table public.daily_menu replica identity full;
alter table public.menu_items replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.daily_menu;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.menu_items;
exception when others then null;
end $$;
