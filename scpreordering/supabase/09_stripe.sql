-- SPC Canteen — Stripe test-mode online payments patch
-- Paste into your EXISTING Supabase project's SQL Editor and click Run.
-- Run this AFTER 08_order_delete.sql. Safe to re-run.
-- If you previously ran 09_paymongo.sql, this patch still works; the older
-- paymongo_* columns are simply unused.
-- Test mode only: no real money moves. The browser never sees a secret key.

-- 1. Store checkout references on orders and payments --------------------------
alter table public.orders
  add column if not exists payment_session_id text,
  add column if not exists payment_checkout_url text;

alter table public.payments
  add column if not exists provider_reference text,
  add column if not exists provider_payment_id text,
  add column if not exists currency text not null default 'PHP',
  add column if not exists event_id text;

-- 2. Webhook deduplication ------------------------------------------------------
create table if not exists public.webhook_events (
  provider text not null,
  event_id text not null,
  payload_type text,
  processed_at timestamptz not null default now(),
  primary key (provider, event_id)
);

alter table public.webhook_events enable row level security;
grant all on public.webhook_events to service_role;

-- 3. Server-side settlement called only by the webhook Edge Function -----------
create or replace function public.complete_online_payment(
  p_order_id uuid,
  p_provider text,
  p_session_id text,
  p_payment_id text,
  p_amount numeric,
  p_currency text,
  p_event_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if p_order_id is null or p_event_id is null then
    raise exception 'Missing payment event details';
  end if;
  if p_provider is distinct from 'stripe' then
    raise exception 'Unsupported payment provider';
  end if;
  if upper(coalesce(p_currency, 'PHP')) <> 'PHP' then
    raise exception 'Only PHP payments are supported';
  end if;

  -- A retried webhook must never settle the same payment twice.
  insert into public.webhook_events (provider, event_id, payload_type)
  values (p_provider, p_event_id, 'checkout.session.completed')
  on conflict (provider, event_id) do nothing;

  if not found then
    return;
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.payment_method <> 'online' then
    raise exception 'This is not an online order';
  end if;

  -- A delayed duplicate after settlement is acknowledged, not applied twice.
  if v_order.payment_status = 'paid' then
    update public.payments
    set
      provider_reference = coalesce(provider_reference, p_session_id),
      provider_payment_id = coalesce(provider_payment_id, p_payment_id),
      event_id = coalesce(event_id, p_event_id)
    where order_id = p_order_id;
    return;
  end if;

  if v_order.payment_status <> 'unpaid' then
    raise exception 'This order can no longer be paid';
  end if;
  if v_order.status not in ('pending', 'accepted', 'payment') then
    raise exception 'This order can no longer be paid';
  end if;
  if abs(coalesce(p_amount, -1) - v_order.total) > 0.01 then
    raise exception 'Payment amount does not match the order total';
  end if;

  -- settle_order() consumes stock atomically and creates the payment row.
  perform public.settle_order(p_order_id, p_provider);

  update public.payments
  set
    provider_reference = p_session_id,
    provider_payment_id = p_payment_id,
    currency = 'PHP',
    event_id = p_event_id
  where order_id = p_order_id;

  update public.orders
  set payment_session_id = coalesce(payment_session_id, p_session_id)
  where id = p_order_id;
end $$;

-- Only the webhook's service-role client may call this.
revoke all on function public.complete_online_payment(uuid, text, text, text, numeric, text, text) from public;
revoke all on function public.complete_online_payment(uuid, text, text, text, numeric, text, text) from anon, authenticated;
grant execute on function public.complete_online_payment(uuid, text, text, text, numeric, text, text) to service_role;

-- If the earlier PayMongo patch was run, lock its settlement helper down too.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'complete_paymongo_payment'
  ) then
    revoke all on function public.complete_paymongo_payment(uuid, text, text, numeric, text) from public;
    revoke all on function public.complete_paymongo_payment(uuid, text, text, numeric, text) from anon, authenticated;
  end if;
end $$;

-- Close the old one-click demo payment path so it cannot bypass the webhook.
revoke all on function public.pay_online(uuid) from public;
revoke all on function public.pay_online(uuid) from anon, authenticated;
