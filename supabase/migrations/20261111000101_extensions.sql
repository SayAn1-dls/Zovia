-- ZUVIO stage 1 / 01 — extensions. All live in schema "extensions" (never in public, so the API
-- does not expose their functions); pg_cron insists on its own "cron" schema.

create extension if not exists postgis with schema extensions;   -- geography points, radius search
create extension if not exists pg_trgm with schema extensions;   -- typo-tolerant locality / title search
create extension if not exists citext with schema extensions;    -- case-insensitive e-mail addresses
create extension if not exists unaccent with schema extensions;  -- accent-insensitive search text

-- pg_cron runs the scheduled jobs of spec 6.9. Install only: jobs are scheduled by a later stage.
-- Guarded so the migration still applies on a Postgres where pg_cron is not available.
do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  else
    raise notice 'pg_cron is not available on this server: scheduled jobs will not be installed';
  end if;
exception
  when others then
    raise notice 'pg_cron could not be installed (%): scheduled jobs will not be installed', sqlerrm;
end
$$;
