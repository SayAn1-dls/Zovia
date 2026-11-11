-- Stage 1: users, profiles, preferences, roles, blocks, restrictions — isolation between users,
-- column protection, staff access, account status. Negative cases first-class.
begin;
select * from no_plan();

select tests.create_user('a@test.zuvio', '{"full_name":"User A"}'::jsonb);
select tests.create_user('b@test.zuvio', '{"full_name":"User B"}'::jsonb);
select tests.create_user('mod@test.zuvio', '{"full_name":"Moderator"}'::jsonb);
select tests.create_user('admin@test.zuvio', '{"full_name":"Admin"}'::jsonb);
select tests.create_user('susp@test.zuvio', '{"full_name":"Suspended"}'::jsonb);
select tests.create_user('gone@test.zuvio', '{"full_name":"Gone"}'::jsonb);
select tests.create_user('suspmod@test.zuvio', '{"full_name":"Suspended Mod"}'::jsonb);
select tests.grant_role(tests.user_id('mod@test.zuvio'), 'moderator');
select tests.grant_role(tests.user_id('admin@test.zuvio'), 'admin');
select tests.grant_role(tests.user_id('suspmod@test.zuvio'), 'moderator');
select tests.set_status(tests.user_id('susp@test.zuvio'), 'suspended');
select tests.set_status(tests.user_id('suspmod@test.zuvio'), 'suspended');
select tests.set_status(tests.user_id('gone@test.zuvio'), 'deleted');

create temp table ids as
  select tests.user_id('a@test.zuvio') as a, tests.user_id('b@test.zuvio') as b, tests.user_id('mod@test.zuvio') as m,
         tests.user_id('admin@test.zuvio') as d, tests.user_id('susp@test.zuvio') as s, tests.user_id('gone@test.zuvio') as g;
grant select on ids to anon, authenticated, service_role;

-- ───────────── anonymous ─────────────
select tests.act_as_anon();
select throws_ok('select * from public.users', '42501', null, 'anon cannot read users');
select throws_ok('select * from public.user_profiles', '42501', null, 'anon cannot read user_profiles');
select throws_ok('select * from public.user_preferences', '42501', null, 'anon cannot read user_preferences');
select throws_ok('select * from public.user_roles', '42501', null, 'anon cannot read user_roles');
select throws_ok('select * from public.user_blocks', '42501', null, 'anon cannot read user_blocks');
select throws_ok('select * from public.user_restrictions', '42501', null, 'anon cannot read user_restrictions');
select throws_ok('select * from public.user_violations', '42501', null, 'anon cannot read user_violations');
select throws_ok($$ insert into public.user_roles (user_id, role) select a, 'admin' from ids $$, '42501', null, 'anon cannot insert roles');
select is((select count(*)::int from public.public_user_cards c, ids where c.user_id in (ids.a, ids.b)), 2, 'anon reads public cards');
select is((select count(*)::int from public.public_user_cards c, ids where c.user_id = ids.g), 0, 'deleted users have no public card');
select is((select count(*)::int from public.public_user_cards c, ids where c.user_id = ids.s), 1, 'suspended users still have a card');
select is((select public.is_staff()), false, 'anon is not staff');
select is((select public.is_active_user()), false, 'anon is not an active user');
select is((select public.has_role('seeker')), false, 'anon has no role');
select is((select public.has_active_restriction('all')), false, 'anon has no restriction');

-- ───────────── user A: sees only their own rows ─────────────
select tests.act_as('a@test.zuvio');
select is((select count(*)::int from public.users), 1, 'A sees exactly one users row');
select is((select id from public.users), (select a from ids), 'and it is their own');
select is((select count(*)::int from public.user_profiles), 1, 'A sees only their own profile');
select is((select count(*)::int from public.user_preferences), 1, 'A sees only their own preferences');
select is((select count(*)::int from public.user_roles), 1, 'A sees only their own roles');
select is((select count(*)::int from public.users u, ids where u.id = ids.b), 0, 'A cannot read B''s users row (e-mail, phone, status)');
select is((select display_name from public.public_user_cards c, ids where c.user_id = ids.b), 'User B', 'A sees B only through the public card');
select is((select public.is_active_user()), true, 'A is an active user');
select is((select public.has_role('seeker')), true, 'A is a seeker');
select is((select public.has_role('admin')), false, 'A is not an admin');
select is((select public.is_admin()), false, 'is_admin() false for A');
select is((select public.is_staff()), false, 'is_staff() false for A');

-- allowed self-service updates
select lives_ok($$ update public.users set intent = 'find_home', onboarding_completed_at = now(), date_of_birth = '2001-04-05', last_seen_at = now() where id = (select a from ids) $$,
                'A updates the safe columns of their own users row');
select is((select intent::text from public.users), 'find_home', 'intent saved');
select lives_ok($$ update public.user_profiles set display_name = 'A Renamed', occupation = 'student', college_name = 'IISc', academic_year = 2, bio = 'Hello' where user_id = (select a from ids) $$,
                'A updates their own profile');
select lives_ok($$ update public.user_preferences set preferred_city = 'Bengaluru', budget_min = 8000, budget_max = 15000, preferred_localities = array['Koramangala'], occupancy_prefs = array[1,2]::smallint[], marketing_opt_in = true where user_id = (select a from ids) $$,
                'A updates their own preferences');
select lives_ok($$ update public.user_profiles set avatar_path = (select a from ids)::text || '/avatar.webp' where user_id = (select a from ids) $$,
                'A sets an avatar inside their own folder');

-- column protection: every privileged column is refused outright
select throws_ok($$ update public.users set status = 'active' where id = (select a from ids) $$, '42501', null, 'A cannot write users.status (even to the same value)');
select throws_ok($$ update public.users set status = 'deleted', deleted_at = now() where id = (select a from ids) $$, '42501', null, 'A cannot delete-mark themselves directly');
select throws_ok($$ update public.users set email = 'evil@test.zuvio' where id = (select a from ids) $$, '42501', null, 'A cannot write users.email');
select throws_ok($$ update public.users set phone = '919999999999' where id = (select a from ids) $$, '42501', null, 'A cannot write users.phone');
select throws_ok($$ update public.users set phone_verified_at = now() where id = (select a from ids) $$, '42501', null, 'A cannot write users.phone_verified_at');
select throws_ok($$ update public.users set id = (select b from ids) where id = (select a from ids) $$, '42501', null, 'A cannot change users.id');
select throws_ok($$ update public.users set created_at = now() where id = (select a from ids) $$, '42501', null, 'A cannot write users.created_at');
select throws_ok($$ update public.user_profiles set user_id = (select b from ids) where user_id = (select a from ids) $$, '42501', null, 'A cannot re-assign their profile to B');
select throws_ok($$ update public.user_preferences set user_id = (select b from ids) where user_id = (select a from ids) $$, '42501', null, 'A cannot re-assign their preferences to B');
select throws_ok($$ insert into public.users (id) values (gen_random_uuid()) $$, '42501', null, 'A cannot insert users');
select throws_ok($$ delete from public.users where id = (select a from ids) $$, '42501', null, 'A cannot delete users');
select throws_ok($$ insert into public.user_profiles (user_id) select b from ids $$, '42501', null, 'A cannot insert profiles');
select throws_ok($$ delete from public.user_profiles $$, '42501', null, 'A cannot delete profiles');

-- roles: no route
select throws_ok($$ insert into public.user_roles (user_id, role) select a, 'admin' from ids $$, '42501', null, 'A cannot grant themselves admin');
select throws_ok($$ insert into public.user_roles (user_id, role) select a, 'owner' from ids $$, '42501', null, 'A cannot grant themselves owner by insert');
select throws_ok($$ update public.user_roles set role = 'admin' where user_id = (select a from ids) $$, '42501', null, 'A cannot change their role');
select throws_ok($$ delete from public.user_roles where user_id = (select a from ids) $$, '42501', null, 'A cannot delete roles');
select throws_ok($$ insert into public.user_restrictions (user_id, kind, reason) select b, 'all', 'x' from ids $$, '42501', null, 'A cannot restrict B');
select throws_ok($$ update public.user_restrictions set lifted_at = now() $$, '42501', null, 'A cannot lift restrictions');
select throws_ok($$ insert into public.user_violations (user_id, kind) select b, 'spam' from ids $$, '42501', null, 'A cannot record violations');
select throws_ok($$ insert into public.user_blocks (blocker_id, blocked_id) select a, b from ids $$, '42501', null, 'A cannot insert blocks directly (function only)');

-- other people's rows: updates match nothing
update public.user_profiles set display_name = 'Hacked' where user_id = (select b from ids);
update public.user_preferences set budget_max = 1 where user_id = (select b from ids);
update public.users set intent = 'list_property' where id = (select b from ids);
select tests.act_as_owner();
select is((select display_name from public.user_profiles p, ids where p.user_id = ids.b), 'User B', 'A''s update of B''s profile changed nothing');
select is((select budget_max from public.user_preferences p, ids where p.user_id = ids.b), null, 'A''s update of B''s preferences changed nothing');
select is((select intent from public.users u, ids where u.id = ids.b), null, 'A''s update of B''s users row changed nothing');
select is((select status::text from public.users u, ids where u.id = ids.a), 'active', 'A''s status is untouched');
select is((select array_agg(role::text) from public.user_roles r, ids where r.user_id = ids.a), array['seeker'], 'A still has only the seeker role');

-- constraints on self-service data
select tests.act_as('a@test.zuvio');
select throws_ok($$ update public.user_profiles set display_name = repeat('x', 61) where user_id = (select a from ids) $$, '23514', null, 'display name longer than 60 refused');
select throws_ok($$ update public.user_profiles set display_name = '' where user_id = (select a from ids) $$, '23514', null, 'empty display name refused');
select throws_ok($$ update public.user_profiles set display_name = ' padded ' where user_id = (select a from ids) $$, '23514', null, 'untrimmed display name refused');
select throws_ok($$ update public.user_profiles set display_name = E'a\nb' where user_id = (select a from ids) $$, '23514', null, 'control characters in display name refused');
select throws_ok($$ update public.user_profiles set avatar_path = (select b from ids)::text || '/x.webp' where user_id = (select a from ids) $$, '23514', null, 'avatar in someone else''s folder refused');
select throws_ok($$ update public.user_profiles set avatar_path = (select a from ids)::text || '/../x.webp' where user_id = (select a from ids) $$, '23514', null, 'avatar path traversal refused');
select throws_ok($$ update public.user_profiles set bio = repeat('x', 501) where user_id = (select a from ids) $$, '23514', null, 'bio longer than 500 refused');
select throws_ok($$ update public.user_profiles set academic_year = 0 where user_id = (select a from ids) $$, '23514', null, 'academic year out of range refused');
select throws_ok($$ update public.user_preferences set budget_min = 20000, budget_max = 10000 where user_id = (select a from ids) $$, '23514', null, 'budget_min > budget_max refused');
select throws_ok($$ update public.user_preferences set budget_min = -1 where user_id = (select a from ids) $$, '23514', null, 'negative budget refused');
select throws_ok($$ update public.user_preferences set occupancy_prefs = array[0]::smallint[] where user_id = (select a from ids) $$, '23514', null, 'occupancy outside 1..12 refused');
select throws_ok($$ update public.users set date_of_birth = current_date + 1 where id = (select a from ids) $$, '23514', null, 'date of birth in the future refused');

-- updated_at is maintained by trigger
select tests.act_as_owner();
update public.user_profiles set updated_at = '2000-01-01' where user_id = (select a from ids);
select cmp_ok((select updated_at from public.user_profiles p, ids where p.user_id = ids.a), '>', '2001-01-01'::timestamptz, 'updated_at cannot be back-dated');
select throws_ok($$ update public.users set status = 'deleted' where id = (select a from ids) $$, '23514', null, 'status deleted requires deleted_at (consistency check)');

-- ───────────── user B is equally isolated from A ─────────────
select tests.act_as('b@test.zuvio');
select is((select count(*)::int from public.users u, ids where u.id = ids.a), 0, 'B cannot read A''s users row');
select is((select count(*)::int from public.user_preferences p, ids where p.user_id = ids.a), 0, 'B cannot read A''s preferences');
select is((select count(*)::int from public.user_roles r, ids where r.user_id = ids.a), 0, 'B cannot read A''s roles');

-- ───────────── moderator ─────────────
select tests.act_as('mod@test.zuvio');
select is((select public.is_staff()), true, 'moderator is staff');
select is((select public.is_admin()), false, 'moderator is not admin');
select is((select public.has_role('moderator')), true, 'has_role(moderator)');
select cmp_ok((select count(*)::int from public.users), '>=', 7, 'moderator reads all users');
select is((select count(*)::int from public.user_profiles p, ids where p.user_id in (ids.a, ids.b)), 2, 'moderator reads profiles');
select is((select count(*)::int from public.user_roles r, ids where r.user_id = ids.d and r.role = 'admin'), 1, 'moderator reads roles');
select throws_ok($$ update public.users set status = 'suspended' where id = (select a from ids) $$, '42501', null, 'moderator cannot write status directly (functions only)');
select throws_ok($$ insert into public.user_roles (user_id, role) select m, 'admin' from ids $$, '42501', null, 'moderator cannot grant themselves admin');
update public.user_profiles set display_name = 'Mod Edit' where user_id = (select a from ids);
select tests.act_as_owner();
select is((select display_name from public.user_profiles p, ids where p.user_id = ids.a), 'A Renamed', 'moderator cannot edit another user''s profile through the table');

-- ───────────── admin ─────────────
select tests.act_as('admin@test.zuvio');
select is((select public.is_admin()), true, 'admin is admin');
select is((select public.is_staff()), true, 'admin is staff');
select throws_ok($$ insert into public.user_roles (user_id, role) select a, 'moderator' from ids $$, '42501', null, 'even an admin has no direct write on user_roles');

-- ───────────── suspended user ─────────────
select tests.act_as('susp@test.zuvio');
select is((select status::text from public.users), 'suspended', 'a suspended user can read their own status');
select is((select public.is_active_user()), false, 'a suspended user is not active');
select is((select public.has_role('seeker')), false, 'a suspended user holds no roles');
update public.user_profiles set display_name = 'Still Here' where user_id = (select s from ids);
update public.users set intent = 'find_home' where id = (select s from ids);
select tests.act_as_owner();
select is((select display_name from public.user_profiles p, ids where p.user_id = ids.s), 'Suspended', 'a suspended user cannot edit their profile');
select is((select intent from public.users u, ids where u.id = ids.s), null, 'a suspended user cannot edit their users row');

select tests.act_as('suspmod@test.zuvio');
select is((select public.is_staff()), false, 'a suspended moderator is not staff');
select is((select count(*)::int from public.users), 1, 'a suspended moderator reads only their own row');

select tests.act_as('gone@test.zuvio');
select is((select public.is_active_user()), false, 'a deleted user is not active');
update public.user_profiles set display_name = 'Back' where user_id = (select g from ids);
select tests.act_as_owner();
select is((select display_name from public.user_profiles p, ids where p.user_id = ids.g), 'Gone', 'a deleted user cannot edit their profile');

-- restricted status still counts as usable
select tests.set_status((select a from ids), 'restricted');
select tests.act_as('a@test.zuvio');
select is((select public.is_active_user()), true, 'a restricted user is still an active user');
select tests.act_as_owner();
select tests.set_status((select a from ids), 'active');

-- ───────────── blocks ─────────────
insert into public.user_blocks (blocker_id, blocked_id) select a, b from ids;
select throws_ok($$ insert into public.user_blocks (blocker_id, blocked_id) select a, a from ids $$, '23514', null, 'nobody can block themselves');
select tests.act_as('a@test.zuvio');
select is((select count(*)::int from public.user_blocks), 1, 'A sees the block they created');
select tests.act_as('b@test.zuvio');
select is((select count(*)::int from public.user_blocks), 0, 'B cannot see that A blocked them');
select throws_ok($$ delete from public.user_blocks $$, '42501', null, 'B cannot delete blocks');

-- ───────────── restrictions and has_active_restriction ─────────────
select tests.act_as_owner();
insert into public.user_restrictions (user_id, kind, reason, ends_at) select a, 'messaging', 'test', now() + interval '1 hour' from ids;
select tests.act_as('a@test.zuvio');
select is((select public.has_active_restriction('messaging')), true, 'active messaging restriction detected');
select is((select public.has_active_restriction('matching')), false, 'a messaging restriction does not restrict matching');
select is((select public.has_active_restriction('all')), false, 'a messaging restriction is not an "all" restriction');
select is((select count(*)::int from public.user_restrictions), 1, 'A sees their own restriction');
select tests.act_as('b@test.zuvio');
select is((select public.has_active_restriction('messaging')), false, 'B is not affected by A''s restriction');
select is((select count(*)::int from public.user_restrictions), 0, 'B cannot see A''s restriction');
select tests.act_as('mod@test.zuvio');
select is((select count(*)::int from public.user_restrictions), 1, 'moderator sees restrictions');

select tests.act_as_owner();
update public.user_restrictions set lifted_at = now();
select tests.act_as('a@test.zuvio');
select is((select public.has_active_restriction('messaging')), false, 'a lifted restriction no longer applies');

select tests.act_as_owner();
insert into public.user_restrictions (user_id, kind, reason, starts_at, ends_at) select a, 'matching', 'expired', now() - interval '2 days', now() - interval '1 day' from ids;
insert into public.user_restrictions (user_id, kind, reason, starts_at) select a, 'listing', 'future', now() + interval '1 day' from ids;
select tests.act_as('a@test.zuvio');
select is((select public.has_active_restriction('matching')), false, 'an expired restriction no longer applies');
select is((select public.has_active_restriction('listing')), false, 'a restriction that has not started does not apply');

select tests.act_as_owner();
insert into public.user_restrictions (user_id, kind, reason) select a, 'all', 'everything' from ids;
select tests.act_as('a@test.zuvio');
select is((select public.has_active_restriction('messaging')), true, 'an "all" restriction covers messaging');
select is((select public.has_active_restriction('matching')), true, 'an "all" restriction covers matching');
select is((select public.has_active_restriction('listing')), true, 'an "all" restriction covers listing');
select is((select public.has_active_restriction('all')), true, 'an "all" restriction is reported for "all"');

select tests.act_as_owner();
select throws_ok($$ insert into public.user_restrictions (user_id, kind, reason, starts_at, ends_at) select a, 'all', 'bad', now(), now() - interval '1 hour' from ids $$,
                 '23514', null, 'a restriction cannot end before it starts');

-- violations: own + staff read
insert into public.user_violations (user_id, kind, detected) select a, 'contact_sharing', '{"kinds":["phone"]}'::jsonb from ids;
select tests.act_as('a@test.zuvio');
select is((select count(*)::int from public.user_violations), 1, 'A sees their own violation');
select tests.act_as('b@test.zuvio');
select is((select count(*)::int from public.user_violations), 0, 'B cannot see A''s violation');
select tests.act_as('mod@test.zuvio');
select is((select count(*)::int from public.user_violations), 1, 'moderator sees violations');

select tests.act_as_owner();
select * from finish();
rollback;
