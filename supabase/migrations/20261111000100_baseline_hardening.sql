-- ZUVIO stage 1 / 00 — baseline hardening: nothing in schema public is reachable by accident.
--
-- THE PROBLEM
--   A Supabase database ships with ALTER DEFAULT PRIVILEGES entries that hand ALL privileges on
--   every new table, sequence and function in schema public to the API roles "anon" and
--   "authenticated" (psql: \ddp, owners "postgres" and "supabase_admin"). On top of that Postgres
--   itself gives EXECUTE on every new function to PUBLIC. A forgotten policy or grant review would
--   therefore expose data. We turn the model around: objects are private until a migration GRANTs.
--
-- THE MECHANISM (verify after `supabase db reset` with \ddp in psql)
--   1. Objects created by "postgres" — the role that runs these migrations, locally and on a hosted
--      project — in schema public:
--        tables     no default privileges for anon / authenticated   (service_role keeps ALL)
--        sequences  no default privileges for anon / authenticated   (service_role keeps ALL)
--        functions  no default privileges for anon / authenticated / service_role
--   2. Functions created by "postgres" in ANY schema no longer get the built-in EXECUTE for PUBLIC.
--      This has to be a global entry (no IN SCHEMA): per-schema default privileges can only add to
--      the global ones, they cannot take the built-in PUBLIC grant away.
--      Consequence: every function needs an explicit GRANT EXECUTE for each role that may call it,
--      service_role included. Trigger functions need none (EXECUTE is not checked when a trigger
--      fires). Extension functions are owned by supabase_admin and are not affected.
--   3. Objects created by "supabase_admin" in schema public: the same revocations are attempted,
--      but only a superuser or a member of supabase_admin may change that role's defaults. Where
--      "postgres" is not allowed (true locally and on hosted projects) the attempt is skipped with
--      a NOTICE. That is acceptable because nothing in this project creates objects in public as
--      supabase_admin: migrations, the SQL editor and `supabase db push` all run as postgres.
--      The security audit test in supabase/tests fails if any table in public is ever reachable
--      by anon/authenticated without being on the explicit list, whoever created it.
--   4. Privileges that already exist on objects in public are revoked (a fresh project has none;
--      this makes the migration correct on a database that is not empty).
--   5. USAGE on schema public stays, otherwise PostgREST could not see the granted objects.
--
-- service_role is the trusted server key (it bypasses RLS). It keeps table and sequence defaults
-- so background paths work, but gets function EXECUTE only where a migration says so.

-- 1. objects created by postgres in public
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;

-- service_role: stated explicitly instead of relying on what the platform set up. A project (or a
-- CLI stack with `auto_expose_new_tables = false`) may start without these defaults.
alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to service_role;

-- 2. no built-in PUBLIC execute on functions created by postgres (global entry, see header)
alter default privileges for role postgres
  revoke execute on functions from public;

-- 3. objects created by supabase_admin in public (best effort, see header)
do $$
begin
  alter default privileges for role supabase_admin in schema public
    revoke all on tables from anon, authenticated;
  alter default privileges for role supabase_admin in schema public
    revoke all on sequences from anon, authenticated;
  alter default privileges for role supabase_admin in schema public
    revoke all on functions from anon, authenticated, service_role;
exception
  when insufficient_privilege then
    raise notice 'default privileges of supabase_admin in schema public left unchanged (% may not alter them)', current_user;
end
$$;

-- 4. anything that already exists
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated, service_role;

-- 5. the schema itself stays visible to the API roles, but they can never create objects in it
revoke create on schema public from public, anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
