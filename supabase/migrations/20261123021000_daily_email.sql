-- daily email from my gmail at 7:40am
create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.profiles add column if not exists last_daily_email date;
alter table public.google_accounts add column if not exists scopes text;

select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'daily_email_cron', 'Lets pg_cron call the daily-email function');

create or replace function public.check_cron_secret(s text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'daily_email_cron' and decrypted_secret = s);
$$;
revoke execute on function public.check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;

-- 23:40 utc = 7:40am malaysia
select cron.schedule('reloved-daily-email', '40 23 * * *', $job$
  select net.http_post(
    url := 'https://oiqyvugxcmbqhmpfjoqp.supabase.co/functions/v1/daily-email',
    headers := jsonb_build_object('content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_email_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);
