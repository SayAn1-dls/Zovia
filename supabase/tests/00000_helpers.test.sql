-- Shared pgTAP helpers. This file sorts first, so `supabase test db` runs it before every other
-- test file. It is the ONE test file that is not wrapped in a transaction: it installs pgTAP and
-- (re)creates the helper functions in schema "tests" so later files, each in its own session,
-- can use them. Everything here is idempotent. The schema exists only in databases where the
-- tests have been run (local and CI) — migrations never create it, and PostgREST does not expose it.
--
-- Usage inside a test file (always between `begin;` and `rollback;`):
--   select tests.create_user('a@test.zuvio');                     -- real auth.users row -> sign-up trigger
--   select tests.grant_role(tests.user_id('a@test.zuvio'), 'moderator');
--   select tests.set_status(tests.user_id('a@test.zuvio'), 'suspended');
--   select tests.act_as('a@test.zuvio');   -- role authenticated + JWT claims of that user
--   select tests.act_as_anon();            -- role anon, no user
--   select tests.act_as_service();         -- role service_role (the trusted server key)
--   select tests.act_as_owner();           -- back to the migration owner (postgres), claims cleared
-- The act_as_* helpers are transaction-local (set_config(..., true)), so `rollback` undoes them.

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Creates a confirmed auth user exactly as Auth would (so the sign-up trigger runs) and returns its id.
create or replace function tests.create_user(p_email text, p_meta jsonb default '{}'::jsonb, p_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, phone, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email, p_phone, '',
          now(), '{"provider":"email","providers":["email"]}'::jsonb, p_meta, now(), now());
  return v_id;
end
$$;

create or replace function tests.user_id(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where email = p_email
$$;

create or replace function tests.grant_role(p_user_id uuid, p_role public.user_role)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.user_roles (user_id, role) values (p_user_id, p_role) on conflict do nothing
$$;

create or replace function tests.set_status(p_user_id uuid, p_status public.account_status)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.users
  set status = p_status,
      deleted_at = case when p_status = 'deleted' then now() end
  where id = p_user_id
$$;

-- Become a signed-in user: role "authenticated" plus the JWT claims PostgREST would set.
create or replace function tests.act_as(p_user_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
end
$$;

create or replace function tests.act_as(p_email text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform tests.act_as_owner();
  v_id := tests.user_id(p_email);
  if v_id is null then
    raise exception 'tests.act_as: no user %', p_email;
  end if;
  perform tests.act_as(v_id);
end
$$;

create or replace function tests.act_as_anon()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end
$$;

create or replace function tests.act_as_service()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end
$$;

-- Back to the session user (postgres, the owner of the schema), with no JWT claims.
create or replace function tests.act_as_owner()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claims', '', true);
end
$$;

-- Only the identity switches are callable after a switch; the privileged helpers stay owner-only.
revoke all on all functions in schema tests from public, anon, authenticated, service_role;
grant execute on function tests.act_as(uuid) to anon, authenticated, service_role;
grant execute on function tests.act_as(text) to anon, authenticated, service_role;
grant execute on function tests.act_as_anon() to anon, authenticated, service_role;
grant execute on function tests.act_as_service() to anon, authenticated, service_role;
grant execute on function tests.act_as_owner() to anon, authenticated, service_role;
grant execute on function tests.user_id(text) to anon, authenticated, service_role;

-- Self-test of the helpers (in a transaction, rolled back).
begin;
select plan(9);

select tests.create_user('helper-a@test.zuvio');
select isnt(tests.user_id('helper-a@test.zuvio'), null, 'create_user creates an auth user');
select is((select count(*)::int from public.users where id = tests.user_id('helper-a@test.zuvio')), 1,
          'create_user fires the sign-up trigger');

select tests.act_as('helper-a@test.zuvio');
select is(current_user::text, 'authenticated', 'act_as switches to role authenticated');
select is((select auth.uid()), tests.user_id('helper-a@test.zuvio'), 'act_as sets auth.uid()');

select tests.act_as_anon();
select is(current_user::text, 'anon', 'act_as_anon switches to role anon');
select is((select auth.uid()), null, 'anon has no auth.uid()');

select tests.act_as_service();
select is(current_user::text, 'service_role', 'act_as_service switches to role service_role');

select tests.act_as_owner();
select is(current_user::text, session_user::text, 'act_as_owner returns to the session user');
select is((select auth.uid()), null, 'act_as_owner clears the claims');

select * from finish();
rollback;
