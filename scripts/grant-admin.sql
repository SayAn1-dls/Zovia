-- Bootstrap: grant the admin role to an existing account, identified by e-mail (spec section 5).
-- After this, further staff roles are granted in the product by an admin (admin_set_role).
--
-- Usage (the account must already exist: sign up first):
--   Local:
--     docker exec -i $(docker ps --format '{{.Names}}' | grep supabase_db | head -1) \
--       psql -U postgres -v ON_ERROR_STOP=1 -v email='person@example.com' < scripts/grant-admin.sql
--   Production: run in the Supabase SQL editor after replacing :'email' with the quoted address,
--     or with psql against the database URL using the same -v email=... flag.
--
-- Idempotent. Fails loudly when no account has that e-mail. Writes an admin_audit_logs row.
-- The person must sign out and in again (or reload) for the app to pick up the role.

\if :{?email}
\else
  \echo 'Pass the e-mail: psql -v email=person@example.com -f scripts/grant-admin.sql'
  \quit
\endif

begin;

select set_config('zuvio.grant_admin_email', :'email', true);

do $$
declare
  v_email text := lower(btrim(current_setting('zuvio.grant_admin_email')));
  v_user  uuid;
begin
  select u.id into v_user from public.users u where lower(u.email::text) = v_email and u.deleted_at is null;
  if v_user is null then
    raise exception 'No active account with e-mail %', v_email;
  end if;

  insert into public.user_roles (user_id, role) values (v_user, 'admin')
  on conflict (user_id, role) do nothing;

  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (null, 'role.grant', 'user', v_user::text, jsonb_build_object('role', 'admin', 'source', 'scripts/grant-admin.sql'));

  raise notice 'admin role granted to % (%)', v_email, v_user;
end
$$;

commit;
