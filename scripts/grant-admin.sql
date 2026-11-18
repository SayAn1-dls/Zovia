-- Bootstrap: grant the admin role to an existing account, identified by e-mail.
-- After this, further staff roles are granted in the product by an admin (admin_set_role).
--
-- How to run (the account must already exist: sign up first):
--   1. Edit the one marked line below: put the account's e-mail between the quotes.
--   2. Supabase dashboard > SQL Editor > paste this whole file > Run.
--      Or with psql:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/grant-admin.sql
--
-- Plain SQL, no psql meta-commands. Idempotent. Raises when no active account has that e-mail.
-- Writes an admin_audit_logs row only when the role was newly granted.
-- The person must sign out and in again (or reload) for the app to pick up the role.
-- Note: the app also requires the e-mail to be listed in ADMIN_EMAILS.

do $$
declare
  v_email   text := 'EDIT-ME@example.com';  -- <<< EDIT THIS LINE: the account's e-mail
  v_user    uuid;
  v_rows    integer;
begin
  v_email := lower(btrim(v_email));
  if v_email = 'edit-me@example.com' then
    raise exception 'Edit the e-mail on the line marked EDIT THIS LINE first.';
  end if;

  select u.id into v_user from public.users u where lower(u.email::text) = v_email and u.deleted_at is null;
  if v_user is null then
    raise exception 'No active account with e-mail %', v_email;
  end if;

  insert into public.user_roles (user_id, role) values (v_user, 'admin')
  on conflict (user_id, role) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
    values (null, 'role.grant', 'user', v_user::text, jsonb_build_object('role', 'admin', 'source', 'scripts/grant-admin.sql'));
    raise notice 'admin role granted to % (%)', v_email, v_user;
  else
    raise notice '% (%) was already an admin; nothing changed', v_email, v_user;
  end if;
end
$$;
