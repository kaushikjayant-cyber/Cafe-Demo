-- Scheduled jobs [D-40]. pg_cron exists on Supabase but not in local PGlite tests,
-- so the schedule is only created when the extension is available.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'expire-stale-payments',
      '*/5 * * * *',
      'select public.expire_stale_payments()'
    );
  end if;
end;
$$;
