-- ZUVIO stage 1 / 07 — row level security policies, grants and the public card view.
--
-- Model (see file 00): nothing is reachable until granted here. For each table: the GRANT says
-- which commands and columns an API role may use at all, the policies say on which rows.
-- service_role keeps full table access from its default privileges (it bypasses RLS) except where
-- revoked below. anon gets nothing in this stage apart from the card view and the contact form.
-- Policies: one per command per role, always "to authenticated", identity through
-- (select auth.uid()) / (select public.is_staff()) so it is evaluated once per statement.

-- ───────────────────────────── users ─────────────────────────────
-- A user may change only harmless columns of their own row. status, email, phone, verification
-- and deletion fields have no UPDATE grant, so no policy can ever let a client write them.
grant select on public.users to authenticated;
grant update (date_of_birth, intent, onboarding_completed_at, last_seen_at) on public.users to authenticated;

create policy users_select_self_or_staff on public.users
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));

create policy users_update_self on public.users
  for update to authenticated
  using (id = (select auth.uid()) and (select public.is_active_user()))
  with check (id = (select auth.uid()));

-- ───────────────────────────── user_profiles ─────────────────────────────
grant select on public.user_profiles to authenticated;
grant update (display_name, avatar_path, gender, occupation, college_name, course, academic_year,
              work_location, company, industry, work_schedule, home_city, bio)
  on public.user_profiles to authenticated;

create policy user_profiles_select_self_or_staff on public.user_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

create policy user_profiles_update_self on public.user_profiles
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()));

-- ───────────────────────────── user_preferences ─────────────────────────────
grant select on public.user_preferences to authenticated;
grant update (preferred_city, preferred_localities, budget_min, budget_max, move_in_date,
              property_types, occupancy_prefs, email_notifications, marketing_opt_in)
  on public.user_preferences to authenticated;

create policy user_preferences_select_self_or_staff on public.user_preferences
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

create policy user_preferences_update_self on public.user_preferences
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()));

-- ───────────────────────────── user_roles ─────────────────────────────
-- Read-only through the API. There is no INSERT/UPDATE/DELETE grant and no write policy.
grant select on public.user_roles to authenticated;

create policy user_roles_select_self_or_staff on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

-- ───────────────────────────── user_blocks ─────────────────────────────
-- A user sees the blocks they created, never who blocked them. Writes: block_user()/unblock_user().
grant select on public.user_blocks to authenticated;

create policy user_blocks_select_own_or_staff on public.user_blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()) or (select public.is_staff()));

-- ───────────────────────────── user_restrictions / user_violations ─────────────────────────────
grant select on public.user_restrictions to authenticated;

create policy user_restrictions_select_self_or_staff on public.user_restrictions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

grant select on public.user_violations to authenticated;

create policy user_violations_select_self_or_staff on public.user_violations
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

-- ───────────────────────────── platform_settings ─────────────────────────────
grant select on public.platform_settings to authenticated;

create policy platform_settings_select_staff on public.platform_settings
  for select to authenticated
  using ((select public.is_staff()));

-- ───────────────────────────── rate_limits ─────────────────────────────
-- Intentionally unreachable: RLS on, no policy, no grant, and service_role loses its default access.
revoke all on public.rate_limits from anon, authenticated, service_role;

-- ───────────────────────────── notifications ─────────────────────────────
-- Own rows only. A user may flip read_at (column grant) and delete; rows are created by notify().
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ───────────────────────────── admin_audit_logs ─────────────────────────────
-- Staff read. Append-only for everyone: no write grant for API users, the trusted key may only
-- read and insert, and the guard trigger in file 05 refuses UPDATE/DELETE/TRUNCATE regardless.
grant select on public.admin_audit_logs to authenticated;
revoke update, delete, truncate on public.admin_audit_logs from service_role;

create policy admin_audit_logs_select_staff on public.admin_audit_logs
  for select to authenticated
  using ((select public.is_staff()));

-- ───────────────────────────── search_history ─────────────────────────────
grant select, insert, delete on public.search_history to authenticated;

create policy search_history_select_own on public.search_history
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy search_history_insert_own on public.search_history
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

create policy search_history_delete_own on public.search_history
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ───────────────────────────── ai_usage_logs ─────────────────────────────
-- Inserts only through log_ai_usage(). Staff read.
grant select on public.ai_usage_logs to authenticated;

create policy ai_usage_logs_select_staff on public.ai_usage_logs
  for select to authenticated
  using ((select public.is_staff()));

-- ───────────────────────────── contact_messages ─────────────────────────────
-- Inserts only through submit_contact_message(). Staff read and triage (status, staff_note).
grant select on public.contact_messages to authenticated;
grant update (status, staff_note) on public.contact_messages to authenticated;

create policy contact_messages_select_staff on public.contact_messages
  for select to authenticated
  using ((select public.is_staff()));

create policy contact_messages_update_staff on public.contact_messages
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- ───────────────────────────── public_user_cards ─────────────────────────────
-- The only thing other people (and signed-out visitors) may see of a user: three columns.
-- Deliberately NOT security_invoker: it runs with its owner's rights so it can read
-- user_profiles past RLS, which is safe because it projects only these columns and filters
-- deleted accounts. security_barrier stops caller-supplied predicates from being evaluated on
-- rows the view filters out.
create view public.public_user_cards
with (security_barrier = true, security_invoker = false)
as
  select p.user_id, p.display_name, p.avatar_path
  from public.user_profiles p
  join public.users u on u.id = p.user_id
  where u.status <> 'deleted' and u.deleted_at is null;

comment on view public.public_user_cards is 'Safe public card of every non-deleted user: user_id, display_name, avatar_path. Readable by anyone (reviews, chat headers). Never add columns without a privacy review.';

revoke all on public.public_user_cards from anon, authenticated;
grant select on public.public_user_cards to anon, authenticated, service_role;
