-- SPC Canteen — cash auto-close schedule
-- Paste into your EXISTING Supabase project's SQL Editor and click Run.
-- Run this AFTER 13_cash_wait.sql and 14_cash_notifications.sql. Safe to re-run.
-- This is additive: you do NOT need to rerun 01–12.
-- Enables pg_cron and checks every minute for unpaid cash orders whose 1-hour
-- pickup window has ended, then closes them through close_expired_cash_orders().

-- 1. Enable pg_cron ------------------------------------------------------------
create extension if not exists pg_cron;

-- 2. Replace the scheduled job -------------------------------------------------
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'close-expired-cash-orders';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end $$;

select cron.schedule(
  'close-expired-cash-orders',
  '* * * * *',
  $$select public.close_expired_cash_orders();$$
);
