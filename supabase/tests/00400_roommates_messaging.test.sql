-- Stage 4: roommate matching, messaging, contact detection, reports.
begin;
select * from no_plan();

select tests.create_user('rm.a@test.zuvio', '{"full_name":"Asha"}'::jsonb);
select tests.create_user('rm.b@test.zuvio', '{"full_name":"Bela"}'::jsonb);
select tests.create_user('rm.c@test.zuvio', '{"full_name":"Chirag"}'::jsonb);
select tests.create_user('rm.d@test.zuvio', '{"full_name":"Dev"}'::jsonb);

create temp table ids as
  select tests.user_id('rm.a@test.zuvio') as a, tests.user_id('rm.b@test.zuvio') as b,
         tests.user_id('rm.c@test.zuvio') as c, tests.user_id('rm.d@test.zuvio') as d;
grant select on ids to authenticated;
create temp table memo (k text primary key, v text);
grant all on memo to authenticated;

-- ═════════════ reference data ═════════════
select is((select count(*)::int from public.lifestyle_questions where is_active), 16, 'sixteen lifestyle questions are seeded');
select is((select string_agg(code || ':' || jsonb_array_length(options), ',' order by code) from public.lifestyle_questions),
  'chores:3,cleanliness:5,cooking:5,drinking:3,food_habit:4,guests:5,kitchen_preference:3,noise:5,overnight_guests:3,personal_space:5,pets:4,rent_payment:3,schedule:5,sleep_schedule:5,smoking:3,social_level:5',
  'question codes and option counts match the compatibility engine');
select is((select sum(weight) from public.compatibility_weights), 1.0000::numeric, 'default weights sum to 1');

-- ═════════════ profiles (own writes through RLS) ═════════════
select tests.act_as('rm.a@test.zuvio');
insert into public.roommate_profiles (user_id, status, headline, age, gender, city, budget_min, budget_max)
  values ((select a from ids), 'active', 'Calm designer', 25, 'female', 'bengaluru', 8000, 12000);
select is((select city from public.roommate_profiles where user_id = (select a from ids)), 'Bengaluru', 'city is normalised to the cities name');
insert into public.roommate_lifestyle_answers (user_id, question_code, value) values ((select a from ids), 'smoking', 1);
select throws_ok($$ insert into public.roommate_lifestyle_answers (user_id, question_code, value) values ((select a from ids), 'cleanliness', 9) $$,
  'ZV422', null, 'an answer outside the options is refused');
select throws_ok($$ insert into public.roommate_profiles (user_id, status, headline) values ((select b from ids), 'draft', 'not mine') $$,
  '42501', null, 'nobody can create a profile for someone else');

select tests.act_as('rm.b@test.zuvio');
select throws_ok($$ insert into public.roommate_profiles (user_id, status, headline) values ((select b from ids), 'active', 'Too early') $$,
  'ZV422', null, 'an incomplete profile cannot go live');
insert into public.roommate_profiles (user_id, status, headline, age, gender, city, budget_min, budget_max)
  values ((select b from ids), 'active', 'Night owl coder', 26, 'female', 'Bengaluru', 9000, 13000);

select tests.act_as('rm.d@test.zuvio');
insert into public.roommate_profiles (user_id, status, headline, age, gender, city, budget_min, budget_max)
  values ((select d from ids), 'active', 'Pune person', 24, 'male', 'Pune', 8000, 10000);

-- ═════════════ candidates ═════════════
select tests.act_as('rm.a@test.zuvio');
select ok(exists (select 1 from public.roommate_candidates(50) c where c ->> 'user_id' = (select b::text from ids)), 'a sees b (same city)');
select ok(not exists (select 1 from public.roommate_candidates(50) c where c ->> 'user_id' = (select d::text from ids)), 'a does not see d (other city)');
select tests.act_as('rm.c@test.zuvio');
select throws_ok($$ select public.roommate_candidates(10) $$, 'ZV404', null, 'no profile -> candidates refuse');
select is((select count(*)::int from public.roommate_profiles where user_id = (select a from ids)), 0, 'without an active profile c cannot read a''s profile');
select is((select count(*)::int from public.roommate_lifestyle_answers), 0, 'answers are private');

-- ═════════════ swipe: mutual like creates exactly one match + conversation ═════════════
select tests.act_as('rm.a@test.zuvio');
select is((public.roommate_swipe((select b from ids), 'like') ->> 'matched')::boolean, false, 'a likes b: no match yet');
select tests.act_as('rm.b@test.zuvio');
insert into memo select 'swipe', public.roommate_swipe((select a from ids), 'like')::text;
select is(((select v from memo where k = 'swipe')::jsonb ->> 'new_match')::boolean, true, 'b likes a: new match');
select is(((public.roommate_swipe((select a from ids), 'like')) ->> 'new_match')::boolean, false, 'liking again does not create another match');
select tests.act_as('rm.a@test.zuvio');
select is(((public.roommate_swipe((select b from ids), 'like')) ->> 'new_match')::boolean, false, 'a liking again does not create another match');
select tests.act_as_owner();
select is((select count(*)::int from public.roommate_matches), 1, 'exactly one match');
select is((select count(*)::int from public.conversations where kind = 'roommate_match'), 1, 'exactly one conversation');
select is((select count(*)::int from public.conversation_members), 2, 'two members');
select is((select count(*)::int from public.notifications where type = 'roommate_match'), 2, 'both people are notified once');
insert into memo select 'conv', (select v from memo where k = 'swipe')::jsonb ->> 'conversation_id';
insert into memo select 'match', (select v from memo where k = 'swipe')::jsonb ->> 'match_id';
select ok(exists (select 1 from public.messages where conversation_id = (select v::uuid from memo where k = 'conv') and kind = 'system'),
  'the conversation opens with a system greeting');

-- ═════════════ messages: members only; no direct writes ═════════════
select tests.act_as('rm.a@test.zuvio');
insert into memo select 'sent', public.send_message((select v::uuid from memo where k = 'conv'), 'Hi Bela!')::text;
select is((select v from memo where k = 'sent')::jsonb ->> 'status', 'sent', 'a member can send');
select throws_ok($$ insert into public.messages (conversation_id, sender_id, body) values ((select v::uuid from memo where k = 'conv'), (select a from ids), 'x') $$,
  '42501', null, 'clients cannot insert messages directly');
select tests.act_as('rm.b@test.zuvio');
select is((select count(*)::int from public.messages where conversation_id = (select v::uuid from memo where k = 'conv')), 2, 'the other member reads the history');
select is((select unread_count from public.my_conversations() where id = (select v::uuid from memo where k = 'conv')), 2, 'unread count for b');
select ok(public.mark_conversation_read((select v::uuid from memo where k = 'conv')) is not null, 'b marks read');
select is((select unread_count from public.my_conversations() where id = (select v::uuid from memo where k = 'conv')), 0, 'nothing unread after reading');
select tests.act_as('rm.c@test.zuvio');
select is((select count(*)::int from public.messages), 0, 'a non-member reads no messages');
select is((select count(*)::int from public.conversations), 0, 'a non-member sees no conversation');
select throws_ok($$ select public.send_message((select v::uuid from memo where k = 'conv'), 'let me in') $$,
  'ZV404', null, 'a non-member cannot send');
select ok(not public.can_access_conversation_topic('conversation:' || (select v from memo where k = 'conv')), 'a non-member cannot join the typing channel');
select tests.act_as('rm.a@test.zuvio');
select ok(public.can_access_conversation_topic('conversation:' || (select v from memo where k = 'conv')), 'a member can join the typing channel');

-- ═════════════ contact details are not delivered ═════════════
select tests.act_as('rm.a@test.zuvio');
select is(public.send_message((select v::uuid from memo where k = 'conv'), 'call me on 98765 43210') ->> 'status', 'blocked', 'a phone number is blocked');
select is((select count(*)::int from public.messages where body like '%98765%'), 0, 'the blocked message was not stored');
select is((select count(*)::int from public.user_violations where user_id = (select a from ids)), 1, 'a violation is recorded');
select is(public.send_message((select v::uuid from memo where k = 'conv'), 'Rent is ₹8,500, moving 12-12-2026, PIN 560034. Do you use WhatsApp?') ->> 'status',
  'sent', 'rents, dates, PIN codes and a plain platform name are delivered');
select is(public.send_message((select v::uuid from memo where k = 'conv'), 'mail me: asha at gmail dot com') ->> 'status', 'blocked', 'second violation');
select is((public.send_message((select v::uuid from memo where k = 'conv'), 'insta @asha.b') ->> 'restricted')::boolean, true,
  'the third violation restricts messaging');
select throws_ok($$ select public.send_message((select v::uuid from memo where k = 'conv'), 'hello?') $$,
  'ZV423', null, 'a restricted user cannot send');

-- detection vectors
select ok((public.detect_contact_info(t) ->> 'detected')::boolean, 'detects: ' || t) from (values
  ('9876543210'), ('98765 43210'), ('+91 98765 43210'), ('nine eight seven six five four three two one zero'),
  ('9-8-7-6-5-4-3-2-1-0'), ('asha.b@gmail.com'), ('asha at gmail dot com'), ('asha (at) yahoo (dot) com'),
  ('email id: asha.b'), ('wa.me/919876543210'), ('t.me/asha'), ('insta: @asha.b'), ('my insta id is ashab'),
  ('add me on snap asha_99'), ('i am @asha.b on insta')) v(t);
select ok(not (public.detect_contact_info(t) ->> 'detected')::boolean, 'ignores: ' || t) from (values
  ('Rent is ₹8,500 per month'), ('Rent 8500, deposit 17000'), ('8500 17000 2000'), ('Move in 12-12-2026'),
  ('PIN 560034'), ('do you use WhatsApp?'), ('I use whatsapp a lot'), ('I work at Yahoo'), ('2026-12-01 to 2027-01-31'),
  ('I have one cat and two plants'), ('The 3BHK costs 25000 and is on the 4th floor'), ('')) v(t);

-- ═════════════ reports ═════════════
select tests.act_as('rm.b@test.zuvio');
insert into memo select 'report', public.submit_report('message', (select ((v::jsonb) -> 'message' ->> 'id')::uuid from memo where k = 'sent'), 'harassment', null)::text;
select is(public.report_message((select ((v::jsonb) -> 'message' ->> 'id')::uuid from memo where k = 'sent'), 'spam')::text,
  (select v from memo where k = 'report'), 'reporting the same message twice returns the same report');
select throws_ok($$ select public.submit_report('user', (select b from ids), 'spam') $$, 'ZV404', null, 'you cannot report yourself');
select ok(public.submit_report('roommate_profile', (select a from ids), 'fake_profile') is not null, 'a visible roommate profile can be reported');

-- ═════════════ unmatch closes the chat; blocks hide profiles ═════════════
select tests.act_as('rm.b@test.zuvio');
select lives_ok($$ select public.roommate_unmatch((select v::uuid from memo where k = 'match')) $$, 'b unmatches');
select is((select status::text from public.conversations where id = (select v::uuid from memo where k = 'conv')), 'closed', 'the chat is closed');
select throws_ok($$ select public.send_message((select v::uuid from memo where k = 'conv'), 'still there?') $$,
  'ZV409', null, 'no messages after unmatch');
select tests.act_as('rm.c@test.zuvio');
select throws_ok($$ select public.roommate_unmatch((select v::uuid from memo where k = 'match')) $$, 'ZV404', null, 'only members can unmatch');

select tests.act_as('rm.a@test.zuvio');
select ok(public.roommate_can_view((select b from ids)), 'before blocking a can view b');
select lives_ok($$ select public.block_user((select b from ids)) $$, 'a blocks b');
select ok(not public.roommate_can_view((select b from ids)), 'after blocking a cannot view b');
select tests.act_as('rm.b@test.zuvio');
select ok(not public.roommate_can_view((select a from ids)), 'and b cannot view a');

-- regression: purging an account with a reported message in its chat must work
select tests.act_as_owner();
select lives_ok($$ delete from auth.users where id = (select a from ids) $$, 'an account with reported messages can be purged');
select ok(exists (select 1 from public.message_reports where reporter_id = (select b from ids)), 'the report (with its snapshot) survives the purge');

select * from finish();
rollback;
