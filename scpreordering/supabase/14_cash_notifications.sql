-- SPC Canteen — cash close notifications
-- Paste into your EXISTING Supabase project's SQL Editor and click Run.
-- Run this AFTER 13_cash_wait.sql. Safe to re-run.
-- You do NOT need to rerun 12_notifications.sql. This script simply replaces
-- the notification function created there with one that understands cash
-- no-show cancellation, release, and 1-hour auto-close.

create or replace function public.notify_order_activity()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_staff record;
  v_number text;
  v_title text;
  v_body text;
  v_cash_reason text;
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
  v_cash_reason := to_jsonb(new)->>'cash_close_reason';

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
        case v_cash_reason
          when 'released_no_show' then 'Order released'
          when 'cancelled_no_show' then 'Order cancelled'
          when 'expired' then 'Order cancelled'
          else case when new.declined_by is not null then 'Order declined' else 'Order cancelled' end
        end
      else null
    end;

    if v_title is not null then
      v_body := case new.status
        when 'accepted' then v_number || ' was confirmed by the canteen.'
        when 'preparing' then v_number || ' is being prepared.'
        when 'ready' then v_number || ' is ready at the counter.'
        when 'completed' then v_number || ' was completed. Thank you!'
        when 'rejected' then
          case v_cash_reason
            when 'released_no_show'
              then v_number || ' was released because it was not paid at the counter. The portions are available again.'
            when 'cancelled_no_show'
              then v_number || ' was cancelled after the cash pickup wait.'
            when 'expired'
              then v_number || ' was closed after the 1-hour cash pickup window.'
            else case when new.declined_by is not null
              then v_number || ' was declined by the canteen.'
              else v_number || ' was cancelled.'
            end
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
