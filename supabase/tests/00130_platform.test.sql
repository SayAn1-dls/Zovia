-- Stage 1: platform tables and functions — notifications, audit log, search history, AI usage,
-- contact form (validation + throttling), settings, rate limits.
begin;
select * from no_plan();

select tests.create_user('a@test.zuvio', '{"full_name":"User A"}'::jsonb);
select tests.create_user('b@test.zuvio', '{"full_name":"User B"}'::jsonb);
select tests.create_user('mod@test.zuvio', '{"full_name":"Moderator"}'::jsonb);
select tests.create_user('admin@test.zuvio', '{"full_name":"Admin"}'::jsonb);
select tests.create_user('susp@test.zuvio', '{"full_name":"Suspended"}'::jsonb);
select tests.create_user('gone@test.zuvio', '{"full_name":"Gone"}'::jsonb);
select tests.grant_role(tests.user_id('mod@test.zuvio'), 'moderator');
select tests.grant_role(tests.user_id('admin@test.zuvio'), 'admin');
select tests.set_status(tests.user_id('susp@test.zuvio'), 'suspended');
select tests.set_status(tests.user_id('gone@test.zuvio'), 'deleted');

create temp table ids as
  select tests.user_id('a@test.zuvio') as a, tests.user_id('b@test.zuvio') as b, tests.user_id('mod@test.zuvio') as m,
         tests.user_id('admin@test.zuvio') as d, tests.user_id('susp@test.zuvio') as s, tests.user_id('gone@test.zuvio') as g;
grant select on ids to anon, authenticated, service_role;
create temp table memo (k text primary key, v text);
grant all on memo to anon, authenticated, service_role;

-- ═════════════ platform_settings / setting_int ═════════════
select is((select count(*)::int from public.platform_settings where (key, value) in (
    ('listing_fresh_days', '30'::jsonb), ('contact_violation_window_days', '30'::jsonb),
    ('contact_violations_before_restriction', '3'::jsonb), ('messaging_restriction_hours', '24'::jsonb),
    ('max_likes_per_day', '100'::jsonb), ('max_inquiries_per_day', '10'::jsonb), ('max_messages_per_minute', '20'::jsonb),
    ('max_contact_reveals_per_day', '20'::jsonb), ('max_reports_per_day', '20'::jsonb), ('assistant_requests_per_hour', '30'::jsonb))),
  10, 'the ten default settings from the spec exist with their values');
select is(public.setting_int('max_likes_per_day', 1), 100, 'setting_int returns the stored value');
select is(public.setting_int('does_not_exist', 7), 7, 'setting_int falls back for a missing key');
insert into public.platform_settings (key, value) values ('zz_text', '"abc"'), ('zz_big', '99999999999999');
select is(public.setting_int('zz_text', 5), 5, 'setting_int falls back for a non-numeric value');
select is(public.setting_int('zz_big', 5), 5, 'setting_int falls back for an out-of-range value');
select throws_ok($$ insert into public.platform_settings (key, value) values ('Bad Key', '1') $$, '23514', null, 'setting keys must be snake_case slugs');

select tests.act_as('a@test.zuvio');
select is((select count(*)::int from public.platform_settings), 0, 'a normal user reads no settings');
select throws_ok($$ select public.setting_int('max_likes_per_day', 1) $$, '42501', null, 'setting_int is not API-callable');
select throws_ok($$ update public.platform_settings set value = '1' $$, '42501', null, 'a normal user cannot change settings');
select tests.act_as('mod@test.zuvio');
select cmp_ok((select count(*)::int from public.platform_settings), '>=', 10, 'staff read settings');
select throws_ok($$ update public.platform_settings set value = '1' where key = 'max_likes_per_day' $$, '42501', null, 'moderator cannot change settings directly');
select throws_ok($$ insert into public.platform_settings (key, value) values ('zz_new', '1') $$, '42501', null, 'moderator cannot add settings directly');
select tests.act_as('admin@test.zuvio');
select throws_ok($$ update public.platform_settings set value = '1' where key = 'max_likes_per_day' $$, '42501', null, 'admin cannot change settings directly (admin function only)');
select tests.act_as_anon();
select throws_ok($$ select * from public.platform_settings $$, '42501', null, 'anon cannot read settings');

-- ═════════════ notifications / notify / mark_notifications_read ═════════════
select tests.act_as_owner();
insert into memo select 'n1', public.notify((select a from ids), 'system', 'Welcome', 'Body text', '/notifications', '{"k":1}'::jsonb)::text;
insert into memo select 'n2', public.notify((select a from ids), 'new_message', 'Second')::text;
insert into memo select 'n3', public.notify((select b from ids), 'system', 'For B')::text;
select isnt((select v from memo where k = 'n1'), null, 'notify returns the new id');
select is(public.notify((select g from ids), 'system', 'To a deleted user'), null, 'notify skips deleted users');
select is(public.notify(gen_random_uuid(), 'system', 'To nobody'), null, 'notify skips unknown users');
select is(public.notify((select a from ids), 'system', '   '), null, 'notify skips an empty title');
insert into memo select 'n4', public.notify((select b from ids), 'system', repeat('t', 300), repeat('b', 900), '//evil.example/x')::text;
select is((select char_length(title) from public.notifications where id = (select v::uuid from memo where k = 'n4')), 140, 'notify trims a long title');
select is((select char_length(body) from public.notifications where id = (select v::uuid from memo where k = 'n4')), 500, 'notify trims a long body');
select is((select link_path from public.notifications where id = (select v::uuid from memo where k = 'n4')), null, 'notify drops a protocol-relative link');
insert into memo select 'n5', public.notify((select b from ids), 'system', 'x', null, 'https://evil.example')::text;
insert into memo select 'n6', public.notify((select b from ids), 'system', 'x', null, '/\evil.example')::text;
insert into memo select 'n7', public.notify((select b from ids), 'system', 'x', null, '/messages/abc?x=1')::text;
insert into memo select 'n8', public.notify((select b from ids), 'system', 'x', null, 'javascript:alert(1)', '[1,2]'::jsonb)::text;
select is((select count(*)::int from memo where k in ('n5','n6','n7','n8') and v is not null), 4, 'a bad link never stops the notification itself');
select is((select link_path from public.notifications where id = (select v::uuid from memo where k = 'n5')), null, 'notify drops an absolute link');
select is((select link_path from public.notifications where id = (select v::uuid from memo where k = 'n6')), null, 'notify drops a backslash link');
select is((select link_path from public.notifications where id = (select v::uuid from memo where k = 'n7')), '/messages/abc?x=1', 'notify keeps a relative link');
select is((select link_path from public.notifications where id = (select v::uuid from memo where k = 'n8')), null, 'notify drops a javascript: link');
select is((select data from public.notifications where id = (select v::uuid from memo where k = 'n8')), '{}'::jsonb, 'notify replaces non-object data with {}');
select throws_ok($$ insert into public.notifications (user_id, type, title, link_path) select a, 'system', 'x', 'javascript:alert(1)' from ids $$, '23514', null, 'the table itself refuses a non-relative link');

select tests.act_as('a@test.zuvio');
select is((select count(*)::int from public.notifications), 2, 'A sees only their own notifications');
select throws_ok($$ select public.notify((select b from ids), 'system', 'spam') $$, '42501', null, 'notify is not API-callable');
select throws_ok($$ insert into public.notifications (user_id, type, title) select b, 'system', 'spam' from ids $$, '42501', null, 'A cannot insert notifications');
select throws_ok($$ insert into public.notifications (user_id, type, title) select a, 'system', 'self' from ids $$, '42501', null, 'A cannot insert notifications even for themselves');
select throws_ok($$ update public.notifications set title = 'changed' $$, '42501', null, 'A cannot rewrite a notification');
select throws_ok($$ update public.notifications set user_id = (select b from ids) $$, '42501', null, 'A cannot re-assign a notification');

select tests.act_as('b@test.zuvio');
select is(public.mark_notifications_read(array[(select v::uuid from memo where k = 'n1')]), 0, 'B cannot mark A''s notification as read');
update public.notifications set read_at = now() where id = (select v::uuid from memo where k = 'n1');
delete from public.notifications where id = (select v::uuid from memo where k = 'n1');
select tests.act_as_owner();
select is((select read_at from public.notifications where id = (select v::uuid from memo where k = 'n1')), null, 'A''s notification is still unread and still exists after B''s attempts');

select tests.act_as('a@test.zuvio');
select is(public.mark_notifications_read(array[(select v::uuid from memo where k = 'n1'), (select v::uuid from memo where k = 'n3')]), 1,
          'marking by id touches only the caller''s own rows');
select is(public.mark_notifications_read(array[(select v::uuid from memo where k = 'n1')]), 0, 'already-read rows are not counted again');
select is(public.mark_notifications_read(), 1, 'null = mark all of mine');
select is((select count(*)::int from public.notifications where read_at is null), 0, 'A has no unread notifications left');
select throws_ok($$ select public.mark_notifications_read((select array_agg(gen_random_uuid()) from generate_series(1, 501))) $$, 'ZV400', null, 'more than 500 ids refused');
select lives_ok($$ update public.notifications set read_at = null where id = (select v::uuid from memo where k = 'n2') $$, 'A may mark their own notification unread');
select lives_ok($$ delete from public.notifications where id = (select v::uuid from memo where k = 'n2') $$, 'A may delete their own notification');
select is((select count(*)::int from public.notifications), 1, 'one notification left for A');
select tests.act_as_owner();
select is((select count(*)::int from public.notifications where user_id = (select b from ids) and read_at is not null), 0, 'B''s notifications were never touched by A');

select tests.act_as_anon();
select throws_ok($$ select * from public.notifications $$, '42501', null, 'anon cannot read notifications');
select throws_ok($$ select public.mark_notifications_read() $$, '42501', null, 'anon cannot call mark_notifications_read');
select tests.act_as_owner();
select set_config('role', 'authenticated', true);
select throws_ok($$ select public.mark_notifications_read() $$, 'ZV401', null, 'a session without a user gets ZV401');
select tests.act_as('mod@test.zuvio');
select is((select count(*)::int from public.notifications), 0, 'staff do not read other people''s notifications');

-- ═════════════ admin_audit_logs / audit ═════════════
select tests.act_as('a@test.zuvio');
select throws_ok($$ select public.audit('x.y', 'thing', 'id') $$, '42501', null, 'audit(text) is not API-callable');
select throws_ok($$ select public.audit('x.y', 'thing', gen_random_uuid()) $$, '42501', null, 'audit(uuid) is not API-callable');
select throws_ok($$ insert into public.admin_audit_logs (action, entity_type) values ('fake.entry', 'thing') $$, '42501', null, 'a user cannot forge an audit entry');

-- a definer function standing in for a later admin function, to prove the actor is auth.uid()
select tests.act_as_owner();
create function public.zz_admin_action(p_claimed_actor uuid) returns uuid language sql security definer set search_path = ''
  as $$ select public.audit('test.action', 'user', p_claimed_actor, '{"note":"x"}'::jsonb) $$;
grant execute on function public.zz_admin_action(uuid) to authenticated;
select tests.act_as('mod@test.zuvio');
insert into memo select 'audit1', public.zz_admin_action((select d from ids))::text;
select tests.act_as_owner();
select is((select actor_id from public.admin_audit_logs where id = (select v::uuid from memo where k = 'audit1')), (select m from ids),
          'audit records auth.uid() as the actor, never a supplied id');
select is((select entity_id from public.admin_audit_logs where id = (select v::uuid from memo where k = 'audit1')), (select d::text from ids), 'uuid entity ids are stored as text');
select isnt(public.audit('system.job', 'platform', null), null, 'system actions are logged with a NULL actor');
select throws_ok($$ select public.audit('Bad Action', 'thing', 'x') $$, '23514', null, 'action names must be slugs');

select throws_ok($$ update public.admin_audit_logs set details = '{}'::jsonb $$, 'ZV403', null, 'the owner role cannot update audit rows');
select throws_ok($$ update public.admin_audit_logs set actor_id = null $$, 'ZV403', null, 'the actor cannot be blanked while the account exists');
select throws_ok($$ delete from public.admin_audit_logs $$, 'ZV403', null, 'the owner role cannot delete audit rows');
select throws_ok($$ truncate public.admin_audit_logs $$, 'ZV403', null, 'the audit log cannot be truncated');

select tests.act_as_service();
select throws_ok($$ update public.admin_audit_logs set action = 'x.y' $$, '42501', null, 'service_role cannot update audit rows');
select throws_ok($$ delete from public.admin_audit_logs $$, '42501', null, 'service_role cannot delete audit rows');

select tests.act_as('a@test.zuvio');
select is((select count(*)::int from public.admin_audit_logs), 0, 'a normal user reads no audit rows');
select tests.act_as('mod@test.zuvio');
select cmp_ok((select count(*)::int from public.admin_audit_logs), '>=', 2, 'staff read the audit log');
select throws_ok($$ update public.admin_audit_logs set action = 'x.y' $$, '42501', null, 'staff cannot update audit rows');
select throws_ok($$ delete from public.admin_audit_logs $$, '42501', null, 'staff cannot delete audit rows');
select tests.act_as_anon();
select throws_ok($$ select * from public.admin_audit_logs $$, '42501', null, 'anon cannot read the audit log');

-- purging the actor keeps the row and only blanks actor_id
select tests.act_as_owner();
select lives_ok($$ delete from auth.users where id = (select m from ids) $$, 'an account with audit history can be purged');
select is((select count(*)::int from public.admin_audit_logs where id = (select v::uuid from memo where k = 'audit1') and actor_id is null and action = 'test.action'), 1,
          'the audit row survives the purge with actor_id NULL');
select tests.create_user('mod2@test.zuvio', '{"full_name":"Moderator Two"}'::jsonb);
select tests.grant_role(tests.user_id('mod2@test.zuvio'), 'moderator');

-- ═════════════ search_history ═════════════
select tests.act_as('a@test.zuvio');
select lives_ok($$ insert into public.search_history (user_id, source, query_text, filters, result_count) select a, 'web', 'pg near college', '{"city":"Pune"}'::jsonb, 12 from ids $$, 'A records their own search');
select lives_ok($$ insert into public.search_history (user_id, source, query_text) select a, 'assistant', '2bhk under 30k' from ids $$, 'A records an assistant search');
select throws_ok($$ insert into public.search_history (user_id, query_text) select b, 'planted' from ids $$, '42501', null, 'A cannot write into B''s history');
select throws_ok($$ insert into public.search_history (user_id, source, query_text) select a, 'other', 'x' from ids $$, '23514', null, 'unknown source refused');
select throws_ok($$ update public.search_history set query_text = 'edited' $$, '42501', null, 'history rows cannot be edited');
select is((select count(*)::int from public.search_history), 2, 'A sees their two rows');
select tests.act_as('b@test.zuvio');
select is((select count(*)::int from public.search_history), 0, 'B cannot see A''s history');
delete from public.search_history;
select tests.act_as('mod2@test.zuvio');
select is((select count(*)::int from public.search_history), 0, 'staff do not read search history');
select tests.act_as('a@test.zuvio');
select is((select count(*)::int from public.search_history), 2, 'B''s delete removed nothing of A''s');
select lives_ok($$ delete from public.search_history where source = 'assistant' $$, 'A deletes their own row');
select is((select count(*)::int from public.search_history), 1, 'one row left');
select tests.act_as('susp@test.zuvio');
select throws_ok($$ insert into public.search_history (user_id, query_text) select s, 'x' from ids $$, '42501', null, 'a suspended user cannot record searches');
select tests.act_as_anon();
select throws_ok($$ select * from public.search_history $$, '42501', null, 'anon cannot read search history');

-- ═════════════ ai_usage_logs / log_ai_usage ═════════════
select tests.act_as('a@test.zuvio');
insert into memo select 'ai1', public.log_ai_usage('anthropic', 'claude-test', 'assistant.chat', 1200, 300, 2, 850, 'success', null)::text;
select isnt((select v from memo where k = 'ai1'), null, 'log_ai_usage returns an id');
select lives_ok($$ select public.log_ai_usage('rule-based', 'basic', 'assistant.chat') $$, 'defaults are accepted');
select lives_ok($$ select public.log_ai_usage('anthropic', 'claude-test', 'assistant.chat', 0, 0, 0, null, 'error', 'provider_timeout') $$, 'an error outcome is accepted');
select throws_ok($$ select public.log_ai_usage('anthropic', 'm', 'assistant.chat', 0, 0, 0, null, 'weird') $$, 'ZV422', null, 'unknown status refused');
select throws_ok($$ select public.log_ai_usage('anthropic', 'm', 'assistant.chat', -1) $$, 'ZV422', null, 'negative tokens refused');
select throws_ok($$ select public.log_ai_usage('Not A Slug', 'm', 'assistant.chat') $$, 'ZV422', null, 'provider must be a slug');
select throws_ok($$ select public.log_ai_usage(null, 'm', 'assistant.chat') $$, 'ZV422', null, 'provider is required');
select is((select count(*)::int from public.ai_usage_logs), 0, 'a normal user cannot read AI usage logs');
select throws_ok($$ insert into public.ai_usage_logs (user_id, provider, model, feature) select b, 'x', 'm', 'f' from ids $$, '42501', null, 'a user cannot insert AI usage rows directly');
select tests.act_as_owner();
select is((select user_id from public.ai_usage_logs where id = (select v::uuid from memo where k = 'ai1')), (select a from ids), 'the row belongs to the caller');
update public.platform_settings set value = '4' where key = 'ai_usage_logs_per_hour';
select tests.act_as('a@test.zuvio');
select lives_ok($$ select public.log_ai_usage('anthropic', 'm', 'assistant.chat') $$, 'fourth row this hour is accepted');
select throws_ok($$ select public.log_ai_usage('anthropic', 'm', 'assistant.chat') $$, 'ZV429', null, 'the per-user hourly cap on log rows is enforced');
select tests.act_as('mod2@test.zuvio');
select is((select count(*)::int from public.ai_usage_logs), 4, 'staff read AI usage logs');
select throws_ok($$ delete from public.ai_usage_logs $$, '42501', null, 'staff cannot delete AI usage logs');
select tests.act_as_anon();
select throws_ok($$ select public.log_ai_usage('anthropic', 'm', 'assistant.chat') $$, '42501', null, 'anon cannot call log_ai_usage');
select tests.act_as_owner();
select set_config('role', 'authenticated', true);
select throws_ok($$ select public.log_ai_usage('anthropic', 'm', 'assistant.chat') $$, 'ZV401', null, 'a session without a user gets ZV401');

-- ═════════════ contact form ═════════════
select tests.act_as_owner();
delete from public.rate_limits where key like 'contact:%';
select tests.act_as_anon();
insert into memo select 'c1', public.submit_contact_message('  Priya S ', ' Priya@Example.com ', '+91 98765 43210', 'Listing question', 'How do I list my PG on ZUVIO?')::text;
select isnt((select v from memo where k = 'c1'), null, 'anon can submit a contact message');
select throws_ok($$ select * from public.contact_messages $$, '42501', null, 'anon cannot read contact messages');
select throws_ok($$ insert into public.contact_messages (name, email, subject, message) values ('Xy', 'x@example.com', 'Subject', 'A long enough message') $$, '42501', null, 'anon cannot insert directly');

select throws_ok($$ select public.submit_contact_message('P', 'p@example.com', null, 'Subject', 'A long enough message') $$, 'ZV422', 'Please enter your name (2 to 80 characters).', 'short name refused');
select throws_ok($$ select public.submit_contact_message(null, 'p@example.com', null, 'Subject', 'A long enough message') $$, 'ZV422', null, 'null name refused');
select throws_ok($$ select public.submit_contact_message('Priya', 'not-an-email', null, 'Subject', 'A long enough message') $$, 'ZV422', 'Please enter a valid e-mail address.', 'bad e-mail refused');
select throws_ok($$ select public.submit_contact_message('Priya', 'a@b', null, 'Subject', 'A long enough message') $$, 'ZV422', null, 'e-mail without a domain suffix refused');
select throws_ok($$ select public.submit_contact_message('Priya', E'p@example.com\nbcc: x@example.com', null, 'Subject', 'A long enough message') $$, 'ZV422', null, 'header injection in the e-mail refused');
select throws_ok($$ select public.submit_contact_message('Priya', 'p@example.com', 'call me', 'Subject', 'A long enough message') $$, 'ZV422', null, 'bad phone refused');
select throws_ok($$ select public.submit_contact_message('Priya', 'p@example.com', null, 'Hi', 'A long enough message') $$, 'ZV422', null, 'short subject refused');
select throws_ok($$ select public.submit_contact_message('Priya', 'p@example.com', null, 'Subject', 'short') $$, 'ZV422', null, 'short message refused');
select throws_ok($$ select public.submit_contact_message('Priya', 'p@example.com', null, 'Subject', repeat('x', 4001)) $$, 'ZV422', null, 'over-long message refused');
select lives_ok($$ select public.submit_contact_message('Priya', 'empty-phone@example.com', '  ', 'Subject', 'A long enough message') $$, 'a blank phone is treated as absent');

-- per e-mail throttle (default 3 per hour); invalid attempts above consumed nothing
select lives_ok($$ select public.submit_contact_message('Priya S', 'priya@example.com', null, 'Second', 'Second message from me') $$, 'second message from the same address');
select lives_ok($$ select public.submit_contact_message('Priya S', 'PRIYA@EXAMPLE.COM', null, 'Third', 'Third message from me!') $$, 'third message (address in another case)');
select throws_ok($$ select public.submit_contact_message('Priya S', 'priya@example.com', null, 'Fourth', 'Fourth message from me') $$, 'ZV429', null, 'fourth message in the hour is throttled');
select throws_ok($$ select public.submit_contact_message('Priya S', ' Priya@Example.Com', null, 'Fifth', 'Fifth message from me!') $$, 'ZV429', null, 'case and padding do not evade the throttle');
select lives_ok($$ select public.submit_contact_message('Someone Else', 'other@example.com', null, 'Hello', 'A different person writes') $$, 'another address is not affected');

select tests.act_as_owner();
select is((select count(*)::int from public.contact_messages where email = 'priya@example.com'), 3, 'exactly three messages stored for the throttled address');
select is((select name || '|' || email::text || '|' || phone || '|' || status from public.contact_messages where id = (select v::uuid from memo where k = 'c1')),
          'Priya S|priya@example.com|+91 98765 43210|new', 'input is trimmed and the e-mail lower-cased');
select is((select user_id from public.contact_messages where id = (select v::uuid from memo where k = 'c1')), null, 'anonymous messages have no user');
-- the window expires
update public.rate_limits set expires_at = clock_timestamp() - interval '1 second', window_start = clock_timestamp() - interval '2 hours' where key = 'contact:email:' || md5('priya@example.com');
select tests.act_as_anon();
select lives_ok($$ select public.submit_contact_message('Priya S', 'priya@example.com', null, 'Later', 'An hour later I write again') $$, 'accepted again once the hour has passed');

-- global hourly cap
select tests.act_as_owner();
delete from public.rate_limits where key = 'contact:global';
update public.platform_settings set value = '2' where key = 'contact_messages_per_hour';
select tests.act_as_anon();
select lives_ok($$ select public.submit_contact_message('Flood One', 'f1@example.com', null, 'Hello', 'Message number one here') $$, 'global cap: first accepted');
select lives_ok($$ select public.submit_contact_message('Flood Two', 'f2@example.com', null, 'Hello', 'Message number two here') $$, 'global cap: second accepted');
select throws_ok($$ select public.submit_contact_message('Flood Three', 'f3@example.com', null, 'Hello', 'Message number three here') $$, 'ZV429', null, 'global cap: third refused whatever the address');
select tests.act_as_owner();
select is((select count(*)::int from public.contact_messages where email in ('f1@example.com', 'f2@example.com', 'f3@example.com')), 2, 'the refused message was not stored');
update public.platform_settings set value = '200' where key = 'contact_messages_per_hour';

-- signed-in sender
select tests.act_as('a@test.zuvio');
insert into memo select 'c2', public.submit_contact_message('User A', 'a@test.zuvio', null, 'Account', 'A question about my account')::text;
select is((select count(*)::int from public.contact_messages), 0, 'a normal user cannot read contact messages, not even their own');
update public.contact_messages set status = 'spam';
select tests.act_as_owner();
select is((select user_id from public.contact_messages where id = (select v::uuid from memo where k = 'c2')), (select a from ids), 'a signed-in sender is recorded from auth.uid()');
select is((select count(*)::int from public.contact_messages where status = 'spam'), 0, 'a normal user''s update changed nothing');

-- staff triage
select tests.act_as('mod2@test.zuvio');
select cmp_ok((select count(*)::int from public.contact_messages), '>=', 5, 'staff read contact messages');
select lives_ok($$ update public.contact_messages set status = 'resolved', staff_note = 'Answered by e-mail' where id = (select v::uuid from memo where k = 'c1') $$, 'staff update status and note');
select is((select handled_by from public.contact_messages where id = (select v::uuid from memo where k = 'c1')), tests.user_id('mod2@test.zuvio'), 'handled_by is stamped from auth.uid()');
select isnt((select handled_at from public.contact_messages where id = (select v::uuid from memo where k = 'c1')), null, 'handled_at is stamped');
select throws_ok($$ update public.contact_messages set message = 'rewritten' $$, '42501', null, 'staff cannot rewrite the message');
select throws_ok($$ update public.contact_messages set handled_by = (select a from ids) $$, '42501', null, 'staff cannot choose handled_by');
select throws_ok($$ update public.contact_messages set status = 'bogus' where id = (select v::uuid from memo where k = 'c1') $$, '23514', null, 'unknown status refused');
select throws_ok($$ delete from public.contact_messages $$, '42501', null, 'staff cannot delete contact messages');

-- ═════════════ rate limits ═════════════
select tests.act_as('a@test.zuvio');
select is(public.consume_rate_limit('test.action', 3, 60), true, 'hit 1 of 3 allowed');
select is(public.consume_rate_limit('test.action', 3, 60), true, 'hit 2 of 3 allowed');
select is(public.consume_rate_limit('test.action', 3, 60), true, 'hit 3 of 3 allowed');
select is(public.consume_rate_limit('test.action', 3, 60), false, 'hit 4 refused');
select is(public.consume_rate_limit('test.action', 3, 60), false, 'hit 5 refused');
select is(public.consume_rate_limit('other.action', 3, 60), true, 'another action has its own budget');
select throws_ok($$ select public.consume_rate_limit('Bad Action!', 3, 60) $$, 'ZV400', null, 'malformed action refused');
select throws_ok($$ select public.consume_rate_limit(null, 3, 60) $$, 'ZV400', null, 'null action refused');
select throws_ok($$ select public.consume_rate_limit('test.action', 0, 60) $$, 'ZV400', null, 'max below 1 refused');
select throws_ok($$ select public.consume_rate_limit('test.action', 3, 0) $$, 'ZV400', null, 'window below 1 second refused');
select throws_ok($$ select public.consume_rate_limit('test.action', 3, 99999999) $$, 'ZV400', null, 'window above 31 days refused');
select throws_ok($$ select public.rate_limit_hit('k', 1, 1) $$, '42501', null, 'rate_limit_hit is not API-callable');
select throws_ok($$ select public.check_rate_limit('ip:1', 1, 60) $$, '42501', null, 'check_rate_limit is not callable by a signed-in user');
select throws_ok($$ select * from public.rate_limits $$, '42501', null, 'a signed-in user cannot read rate_limits');
select throws_ok($$ delete from public.rate_limits $$, '42501', null, 'a signed-in user cannot reset rate limits');

select tests.act_as('b@test.zuvio');
select is(public.consume_rate_limit('test.action', 3, 60), true, 'B has a separate budget from A');

-- window expiry starts a fresh window
select tests.act_as_owner();
select is((select count from public.rate_limits where key = 'u:' || (select a::text from ids) || ':test.action:60'), 5, 'every hit of A was counted, refused ones included');
update public.rate_limits set expires_at = clock_timestamp() - interval '1 second', window_start = clock_timestamp() - interval '61 seconds'
  where key = 'u:' || (select a::text from ids) || ':test.action:60';
select tests.act_as('a@test.zuvio');
select is(public.consume_rate_limit('test.action', 3, 60), true, 'allowed again after the window expired');
select tests.act_as_owner();
select is((select count from public.rate_limits where key = 'u:' || (select a::text from ids) || ':test.action:60'), 1, 'the counter restarted at 1');

select tests.act_as_anon();
select throws_ok($$ select public.consume_rate_limit('test.action', 3, 60) $$, '42501', null, 'anon cannot call consume_rate_limit');
select throws_ok($$ select public.check_rate_limit('ip:1', 1, 60) $$, '42501', null, 'anon cannot call check_rate_limit');
select tests.act_as_owner();
select set_config('role', 'authenticated', true);
select throws_ok($$ select public.consume_rate_limit('test.action', 3, 60) $$, 'ZV401', null, 'a session without a user gets ZV401');

select tests.act_as_service();
select is(public.check_rate_limit('ip:203.0.113.9:search', 2, 60), true, 'service_role: hit 1 of 2');
select is(public.check_rate_limit('ip:203.0.113.9:search', 2, 60), true, 'service_role: hit 2 of 2');
select is(public.check_rate_limit('ip:203.0.113.9:search', 2, 60), false, 'service_role: hit 3 refused');
select is(public.check_rate_limit('ip:203.0.113.10:search', 2, 60), true, 'service_role: another key is independent');
select throws_ok($$ select public.check_rate_limit('', 2, 60) $$, 'ZV400', null, 'empty key refused');
select throws_ok($$ select * from public.rate_limits $$, '42501', null, 'service_role cannot read rate_limits directly');
select throws_ok($$ select public.consume_rate_limit('test.action', 3, 60) $$, '42501', null, 'service_role has no consume_rate_limit (it has no user)');

-- a user-chosen action can never collide with a server key or another user's key
select tests.act_as_owner();
select is((select count(*)::int from public.rate_limits where key not like 'u:%' and key not like 'k:%' and key not like 'contact:%' and key not like 'ai_log:%'), 0,
          'every counter key is namespaced');

select * from finish();
rollback;
