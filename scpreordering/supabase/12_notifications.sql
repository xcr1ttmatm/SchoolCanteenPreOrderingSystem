-- SPC Canteen — realtime order notifications
-- Paste into your EXISTING Supabase project's SQL Editor and click Run.
-- Run this AFTER 11_staff_order_actions.sql. Safe to re-run.
-- Staff are notified of new orders and completed payments. Customers are
-- notified when their order changes stage. Nothing is inserted from the client.

-- 1. Table ---------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id, read_at);

alter table public.notifications enable row level security;

drop policy if exists "notifications_read" on public.notifications;
create policy "notifications_read" on public.notifications
  for select to authenticated
  using (user_id = auth.uid() and public.is_active_user(auth.uid()));

drop policy if exists "notifications_mark_read" on public.notifications;
create policy "notifications_mark_read" on public.notifications
  for update to authenticated
  using (user_id = auth.uid() and public.is_active_user(auth.uid()))
  with check (user_id = auth.uid() and public.is_active_user(auth.uid()));

grant select, update on public.notifications to authenticated;

-- 2. Realtime ------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- 3. Trigger -------------------------------------------------------------------
create or replace function public.notify_order_activity()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_staff record;
  v_number text;
  v_title text;
  v_body text;
begin
  if tg_op = 'INSERT' then
    for v_staff in
      select id from public.profiles where role = 'staff' and is_active
    loop
      insert into public.notifications (user_id, order_id, title, body)
      values (
        v_staff.id,
        new.id,
        'New order placed',
        new.order_number || ' was just placed by a customer.'
      );
    end loop;
    return new;
  end if;

  v_number := new.order_number;

  -- Payment completed: notify the whole active staff team.
  if old.payment_status is distinct from 'paid' and new.payment_status = 'paid' then
    for v_staff in
      select id from public.profiles where role = 'staff' and is_active
    loop
      insert into public.notifications (user_id, order_id, title, body)
      values (
        v_staff.id,
        new.id,
        'Payment completed',
        v_number || ' has been paid. Stock has been consumed.'
      );
    end loop;
  end if;

  -- Stage changes: notify the customer who owns the order.
  if old.status is distinct from new.status then
    v_title := case new.status
      when 'accepted' then 'Order confirmed'
      when 'preparing' then 'Order being prepared'
      when 'ready' then 'Ready for pickup'
      when 'completed' then 'Order completed'
      when 'rejected' then
        case when new.declined_by is not null then 'Order declined' else 'Order cancelled' end
      else null
    end;

    if v_title is not null then
      v_body := case new.status
        when 'accepted' then v_number || ' was confirmed by the canteen.'
        when 'preparing' then v_number || ' is being prepared.'
        when 'ready' then v_number || ' is ready at the counter.'
        when 'completed' then v_number || ' was completed. Thank you!'
        when 'rejected' then
          case when new.declined_by is not null
            then v_number || ' was declined by the canteen.'
            else v_number || ' was cancelled.'
          end
      end;

      insert into public.notifications (user_id, order_id, title, body)
      values (new.user_id, new.id, v_title, v_body);
    end if;
  end if;

  return new;
end $$;

drop trigger if exists notify_order_activity on public.orders;
create trigger notify_order_activity
  after insert or update on public.orders
  for each row
  execute function public.notify_order_activity();
