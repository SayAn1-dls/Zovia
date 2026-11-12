-- Stage 1: baseline hardening, extensions, enums. Proves that new objects in schema public are
-- private until granted and that internal functions are not callable through the API.
begin;
select * from no_plan();

-- ── new objects created by the migration role get no API privileges ──
create table public.zz_probe (id integer);
create sequence public.zz_probe_seq;
create function public.zz_probe_fn() returns integer language sql as 'select 1';

select ok(not has_table_privilege('anon', 'public.zz_probe', 'select'), 'new table: anon cannot select');
select ok(not has_table_privilege('anon', 'public.zz_probe', 'insert'), 'new table: anon cannot insert');
select ok(not has_table_privilege('authenticated', 'public.zz_probe', 'select'), 'new table: authenticated cannot select');
select ok(not has_table_privilege('authenticated', 'public.zz_probe', 'insert'), 'new table: authenticated cannot insert');
select ok(not has_table_privilege('authenticated', 'public.zz_probe', 'update'), 'new table: authenticated cannot update');
select ok(not has_table_privilege('authenticated', 'public.zz_probe', 'delete'), 'new table: authenticated cannot delete');
select ok(has_table_privilege('service_role', 'public.zz_probe', 'select, insert, update, delete'), 'new table: service_role has full access');
select ok(not has_sequence_privilege('anon', 'public.zz_probe_seq', 'usage'), 'new sequence: anon has no usage');
select ok(not has_sequence_privilege('authenticated', 'public.zz_probe_seq', 'usage'), 'new sequence: authenticated has no usage');
select ok(not has_function_privilege('anon', 'public.zz_probe_fn()', 'execute'), 'new function: anon cannot execute (no PUBLIC grant)');
select ok(not has_function_privilege('authenticated', 'public.zz_probe_fn()', 'execute'), 'new function: authenticated cannot execute');
select ok(not has_function_privilege('service_role', 'public.zz_probe_fn()', 'execute'), 'new function: service_role cannot execute until granted');

select tests.act_as_anon();
select throws_ok('select * from public.zz_probe', '42501', null, 'anon is refused on an ungranted table');
select throws_ok('select public.zz_probe_fn()', '42501', null, 'anon is refused on an ungranted function');
select tests.act_as_owner();
grant select on public.zz_probe to anon;
select tests.act_as_anon();
select lives_ok('select * from public.zz_probe', 'anon reaches the table once it is granted');
select tests.act_as_owner();

-- ── schema privileges ──
select ok(has_schema_privilege('anon', 'public', 'usage'), 'anon keeps USAGE on public');
select ok(has_schema_privilege('authenticated', 'public', 'usage'), 'authenticated keeps USAGE on public');
select ok(not has_schema_privilege('anon', 'public', 'create'), 'anon cannot create in public');
select ok(not has_schema_privilege('authenticated', 'public', 'create'), 'authenticated cannot create in public');
select ok(not has_schema_privilege('service_role', 'public', 'create'), 'service_role cannot create in public');

-- ── every table of this stage has RLS enabled and is not forced ──
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and c.relname <> 'zz_probe' and not c.relrowsecurity),
  '', 'every table in public has row level security enabled');
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relforcerowsecurity),
  '', 'no table uses FORCE ROW LEVEL SECURITY');

-- ── anon reaches nothing in this stage except the card view ──
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm')
     and c.relname in ('users','user_profiles','user_preferences','user_roles','user_blocks','user_restrictions',
                       'user_violations','platform_settings','rate_limits','notifications','admin_audit_logs',
                       'search_history','ai_usage_logs','contact_messages')
     and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
          or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))),
  '', 'anon has no privilege on any stage-1 table');
select ok(has_table_privilege('anon', 'public.public_user_cards', 'select'), 'anon may read public_user_cards');

-- rate_limits is unreachable for every API role
select ok(not has_table_privilege('authenticated', 'public.rate_limits', 'select'), 'rate_limits: authenticated has no access');
select ok(not has_table_privilege('service_role', 'public.rate_limits', 'select'), 'rate_limits: service_role has no access');
select ok(not has_table_privilege('service_role', 'public.rate_limits', 'insert'), 'rate_limits: service_role cannot insert');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'rate_limits'), 0,
          'rate_limits has no policies');

-- ── internal functions are not executable through the API ──
select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by 1), '')
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('set_updated_at','clean_display_name','admin_audit_logs_guard','contact_messages_stamp_handler',
                       'setting_int','rate_limit_hit','notify','audit','handle_new_auth_user','handle_auth_user_updated')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute'))),
  '', 'internal and trigger functions are executable by no API role');
select ok(not has_function_privilege('anon', 'public.check_rate_limit(text, integer, integer)', 'execute'), 'check_rate_limit: not anon');
select ok(not has_function_privilege('authenticated', 'public.check_rate_limit(text, integer, integer)', 'execute'), 'check_rate_limit: not authenticated');
select ok(has_function_privilege('service_role', 'public.check_rate_limit(text, integer, integer)', 'execute'), 'check_rate_limit: service_role only');
select ok(not has_function_privilege('anon', 'public.consume_rate_limit(text, integer, integer)', 'execute'), 'consume_rate_limit: not anon');
select ok(not has_function_privilege('anon', 'public.mark_notifications_read(uuid[])', 'execute'), 'mark_notifications_read: not anon');
select ok(not has_function_privilege('anon', 'public.log_ai_usage(text, text, text, integer, integer, integer, integer, text, text)', 'execute'), 'log_ai_usage: not anon');
select ok(has_function_privilege('anon', 'public.submit_contact_message(text, text, text, text, text)', 'execute'), 'submit_contact_message: anon may call');

-- every function of this stage pins an empty search_path
select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by 1), '')
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname <> 'zz_probe_fn'
     and not coalesce(p.proconfig, '{}') @> array['search_path=""']),
  '', 'every function in public sets search_path = ''''');

-- ── extensions and enums ──
select is((select n.nspname::text from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'postgis'), 'extensions', 'postgis lives in schema extensions');
select is((select n.nspname::text from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm'), 'extensions', 'pg_trgm lives in schema extensions');
select is((select n.nspname::text from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'citext'), 'extensions', 'citext lives in schema extensions');
select is((select n.nspname::text from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'unaccent'), 'extensions', 'unaccent lives in schema extensions');

select enum_has_labels('public', 'user_role', array['seeker','owner','moderator','admin']);
select enum_has_labels('public', 'account_status', array['active','restricted','suspended','deleted']);
select enum_has_labels('public', 'user_intent', array['find_home','find_roommate','have_place_need_roommate','list_property']);
select enum_has_labels('public', 'occupation_type', array['student','working_professional','other']);
select enum_has_labels('public', 'gender', array['male','female','non_binary','prefer_not_to_say']);
select enum_has_labels('public', 'work_schedule', array['day','night','flexible','remote','irregular']);
select enum_has_labels('public', 'verification_status', array['unverified','pending','verified','rejected','expired']);
select enum_has_labels('public', 'restriction_kind', array['messaging','matching','listing','all']);
select enum_has_labels('public', 'violation_kind', array['contact_sharing','harassment','spam','other']);
select has_type('public', 'notification_type', 'notification_type exists');

select * from finish();
rollback;
