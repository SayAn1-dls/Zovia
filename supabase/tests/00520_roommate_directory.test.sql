-- Roommate directory (20261120000500): signed-in users browse profiles whose owners opted in.
-- Only an allow-list of fields leaves the database; blocks, suspensions and the owner's choices
-- (consent, Hide/Show, Available, show age and gender) are enforced in SQL.
begin;
select * from no_plan();

select tests.create_user('dir.v@test.zuvio', '{"full_name":"Viewer"}'::jsonb, '+919800000001');
select tests.create_user('dir.b@test.zuvio', '{"full_name":"Bela"}'::jsonb, '+919800000002');
select tests.create_user('dir.c@test.zuvio', '{"full_name":"Chirag"}'::jsonb);
select tests.create_user('dir.d@test.zuvio', '{"full_name":"Dev"}'::jsonb);
select tests.create_user('dir.e@test.zuvio', '{"full_name":"Esha"}'::jsonb);
select tests.create_user('dir.g@test.zuvio', '{"full_name":"Gita"}'::jsonb);
select tests.create_user('dir.s@test.zuvio', '{"full_name":"Suspended Sam"}'::jsonb);
select tests.create_user('dir.n@test.zuvio', '{"full_name":"No Profile"}'::jsonb);

create temp table ids as
  select tests.user_id('dir.v@test.zuvio') as v, tests.user_id('dir.b@test.zuvio') as b,
         tests.user_id('dir.c@test.zuvio') as c, tests.user_id('dir.d@test.zuvio') as d,
         tests.user_id('dir.e@test.zuvio') as e, tests.user_id('dir.g@test.zuvio') as g,
         tests.user_id('dir.s@test.zuvio') as s, tests.user_id('dir.n@test.zuvio') as n;
grant select on ids to anon, authenticated, service_role;

-- items of one directory call as the current role
create function pg_temp.items(p_city text default null, p_available boolean default null) returns jsonb language sql volatile as
  'select public.roommate_directory(p_city, p_available, 48, 0) -> ''items''';
grant execute on function pg_temp.items(text, boolean) to anon, authenticated, service_role;
create function pg_temp.listed(p_user uuid, p_city text default null, p_available boolean default null) returns boolean language sql volatile as
  'select exists (select 1 from jsonb_array_elements(pg_temp.items(p_city, p_available)) i where i ->> ''user_id'' = p_user::text)';
grant execute on function pg_temp.listed(uuid, text, boolean) to anon, authenticated, service_role;
create function pg_temp.card(p_user uuid) returns jsonb language sql volatile as
  'select i from jsonb_array_elements(pg_temp.items()) i where i ->> ''user_id'' = p_user::text';
grant execute on function pg_temp.card(uuid) to anon, authenticated, service_role;

-- ── fixtures (as the table owner, past RLS; the triggers still run) ──
-- v: listed in Pune. b, c, g, s: listed in Bengaluru. d: never consented. e: consented but hidden.
insert into public.roommate_profiles (user_id, status, headline, about, age, gender, city, preferred_localities,
                                      budget_min, budget_max, move_in_date,
                                      directory_visible, directory_consent_at, available, show_age_gender)
select u, 'active', 'Profile ' || k, 'Private about text', age, gender::public.gender, city, array['Koramangala', 'HSR Layout'],
       8000, 12000, date '2026-12-01',
       visible, consent, avail, show
from ids, (values
  ('v', 'Pune',      30, 'male',   true,  timestamptz '2001-01-01', true,  false),
  ('b', 'Bengaluru', 25, 'female', true,  timestamptz '2001-01-01', true,  true),
  ('c', 'Bengaluru', 27, 'male',   true,  timestamptz '2001-01-01', false, false),
  ('d', 'Bengaluru', 28, 'male',   false, null,                     true,  true),
  ('e', 'Bengaluru', 29, 'female', false, timestamptz '2001-01-01', true,  true),
  ('g', 'Bengaluru', 31, 'female', true,  timestamptz '2001-01-01', true,  true),
  ('s', 'Bengaluru', 33, 'male',   true,  timestamptz '2001-01-01', true,  true)
) f(k, city, age, gender, visible, consent, avail, show),
lateral (select case k when 'v' then ids.v when 'b' then ids.b when 'c' then ids.c when 'd' then ids.d
                       when 'e' then ids.e when 'g' then ids.g else ids.s end as u) x;

insert into public.roommate_lifestyle_answers (user_id, question_code, value)
  select b, q, val from ids, (values ('smoking', 1), ('food_habit', 1), ('noise', 5), ('guests', 4)) a(q, val);
insert into public.roommate_profile_photos (user_id, storage_path, position)
  select b, b::text || '/first.jpg', 0 from ids
  union all select b, b::text || '/second.jpg', 1 from ids;

-- ═════════════ schema and grants ═════════════
select is((select column_default from information_schema.columns where table_schema = 'public' and table_name = 'roommate_profiles' and column_name = 'directory_visible'),
  'false', 'directory_visible defaults to false (hidden)');
select is((select column_default from information_schema.columns where table_schema = 'public' and table_name = 'roommate_profiles' and column_name = 'show_age_gender'),
  'false', 'show_age_gender defaults to false');
select is((select column_default from information_schema.columns where table_schema = 'public' and table_name = 'roommate_profiles' and column_name = 'available'),
  'true', 'available defaults to true');
select ok(col_description('public.roommate_profiles'::regclass, a.attnum) is not null, 'column has a comment: ' || a.attname)
  from pg_attribute a
  where a.attrelid = 'public.roommate_profiles'::regclass
    and a.attname in ('directory_visible', 'directory_consent_at', 'available', 'show_age_gender');
select ok(not has_function_privilege('anon', 'public.roommate_directory(text, boolean, integer, integer)', 'execute'), 'roommate_directory: not anon');
select ok(has_function_privilege('authenticated', 'public.roommate_directory(text, boolean, integer, integer)', 'execute'), 'roommate_directory: authenticated');
select ok(not has_function_privilege('anon', 'public.roommate_directory_is_listed(uuid)', 'execute'), 'roommate_directory_is_listed: not anon');
select ok(not has_function_privilege('anon', 'public.roommate_directory_photo_visible(text)', 'execute'), 'roommate_directory_photo_visible: not anon');
select ok(not has_function_privilege('authenticated', 'public.roommate_profiles_directory_guard()', 'execute'), 'directory guard trigger is not API-callable');
select ok(coalesce(p.proconfig, '{}') @> array['search_path=""'], 'search_path is empty: ' || p.proname)
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname in ('roommate_directory', 'roommate_directory_is_listed',
                                               'roommate_directory_photo_visible', 'roommate_profiles_directory_guard');
select ok(p.prosecdef, 'security definer: ' || p.proname)
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname in ('roommate_directory', 'roommate_directory_is_listed', 'roommate_directory_photo_visible');

-- consent time is the server's, not the client's
select is((select directory_consent_at from public.roommate_profiles where user_id = (select b from ids)), now(),
  'a first consent is stamped with the server time, not the client value');
select is((select directory_visible from public.roommate_profiles where user_id = (select d from ids)), false,
  'without consent the profile stays hidden');
update public.roommate_profiles set directory_visible = true where user_id = (select d from ids);
select is((select directory_visible from public.roommate_profiles where user_id = (select d from ids)), false,
  'turning visibility on without consent is ignored (the profile stays hidden)');
select ok(exists (select 1 from pg_constraint where conname = 'roommate_profiles_directory_needs_consent'),
  'a check constraint backs the rule: visible requires consent');

-- ═════════════ anonymous visitors ═════════════
select tests.act_as_anon();
select throws_ok($$ select public.roommate_directory() $$, '42501', null, 'anon gets permission denied');
select throws_ok($$ select public.roommate_directory_is_listed((select b from ids)) $$, '42501', null, 'anon cannot probe who is listed');

-- ═════════════ a signed-in user without a roommate profile ═════════════
select tests.act_as('dir.n@test.zuvio');
select ok(pg_temp.listed((select b from ids)), 'a signed-in user with no profile can browse');
select is(jsonb_array_length(pg_temp.items()), 5, 'they see the five listed people (v, b, c, g, s)');
select ok(not pg_temp.listed((select d from ids)), 'a profile without consent is not listed');
select ok(not pg_temp.listed((select e from ids)), 'a consented but hidden profile is not listed');

-- ═════════════ card contents: exactly the allowed fields ═════════════
select tests.act_as('dir.v@test.zuvio');
select ok(not pg_temp.listed((select v from ids)), 'nobody sees themselves');
select is((select array_agg(k order by k) from jsonb_object_keys(pg_temp.card((select b from ids))) k),
  array['age', 'available', 'budget_max', 'budget_min', 'city', 'display_name', 'gender', 'lifestyle', 'move_in_date',
        'photo_path', 'preferred_localities', 'user_id'],
  'a card that shows age and gender has exactly the allowed keys');
select is((select array_agg(k order by k) from jsonb_object_keys(pg_temp.card((select c from ids))) k),
  array['available', 'budget_max', 'budget_min', 'city', 'display_name', 'lifestyle', 'move_in_date',
        'photo_path', 'preferred_localities', 'user_id'],
  'without show_age_gender the card has no age or gender keys');
select is((pg_temp.card((select b from ids)) ->> 'age')::int, 25, 'age is shown when the owner chose to');
select is(pg_temp.card((select b from ids)) ->> 'gender', 'female', 'gender is shown when the owner chose to');
select is(pg_temp.card((select b from ids)) ->> 'display_name', 'Bela', 'display name comes from the user profile');
select is(pg_temp.card((select b from ids)) -> 'lifestyle', '{"smoking": 1, "food_habit": 1}'::jsonb,
  'lifestyle carries only the allow-listed questions');
select is(pg_temp.card((select b from ids)) ->> 'photo_path', (select b::text || '/first.jpg' from ids), 'only the first photo is returned');
select is(pg_temp.card((select c from ids)) -> 'photo_path', 'null'::jsonb, 'no photo -> null');
select is(pg_temp.card((select c from ids)) ->> 'available', 'false', 'the Available badge is the owner''s flag');
select ok(not (pg_temp.items()::text ~* '(phone|email|last_active|location|headline|about|Private about|\+9198)'),
  'no phone, e-mail, last activity, location, headline or about anywhere in the directory');

-- photos: the first photo of a listed person opens, the others do not
select ok(public.roommate_directory_photo_visible((select b::text || '/first.jpg' from ids)), 'the first photo is readable by a directory viewer');
select ok(not public.roommate_directory_photo_visible((select b::text || '/second.jpg' from ids)), 'later photos are not opened by the directory');
select ok(not public.roommate_directory_photo_visible('not-a-user/first.jpg'), 'a malformed path is refused');

-- ═════════════ filters and pagination ═════════════
select ok(pg_temp.listed((select b from ids), 'Bengaluru'), 'city filter: Bengaluru includes b');
select ok(pg_temp.listed((select b from ids), 'bengaluru'), 'city filter is case-insensitive');
select ok(not pg_temp.listed((select b from ids), 'Pune'), 'city filter: Pune excludes b');
select ok(pg_temp.listed((select b from ids), null, true), 'available filter true: b (available) is listed');
select ok(not pg_temp.listed((select c from ids), null, true), 'available filter true: c (not available) is left out');
select ok(pg_temp.listed((select c from ids), null, false), 'available filter false: c is listed');
select ok(not pg_temp.listed((select b from ids), null, false), 'available filter false: b is left out');
select is(jsonb_array_length(public.roommate_directory(null, null, 1, 0) -> 'items'), 1, 'limit 1 returns one card');
select is((public.roommate_directory(null, null, 1, 0) ->> 'has_more')::boolean, true, 'and says there is more');
select is((public.roommate_directory(null, null, 2, 2) ->> 'has_more')::boolean, false, 'the last page says there is no more (4 visible to v)');
select is(jsonb_array_length(public.roommate_directory(null, null, 2, 2) -> 'items'), 2, 'the last page has the remaining two cards');
select is((public.roommate_directory(null, null, 1000, -5) ->> 'limit')::int, 48, 'limit is capped at 48');
select is((public.roommate_directory(null, null, 1000, -5) ->> 'offset')::int, 0, 'a negative offset becomes 0');
select throws_ok($$ select public.roommate_directory(repeat('x', 81)) $$, 'ZV400', null, 'an over-long city is refused');

-- ═════════════ blocks: excluded both ways ═════════════
select tests.act_as('dir.g@test.zuvio');
select ok(pg_temp.listed((select v from ids)), 'before the block g sees v');
select public.block_user((select v from ids));
select ok(not pg_temp.listed((select v from ids)), 'after g blocks v, g no longer sees v');
select tests.act_as('dir.v@test.zuvio');
select ok(not pg_temp.listed((select g from ids)), 'and v no longer sees g (the blocked side)');
select ok(not public.roommate_directory_is_listed((select g from ids)), 'is_listed agrees for the blocked pair');

-- ═════════════ suspended and deleted accounts ═════════════
select tests.act_as_owner();
select tests.set_status((select s from ids), 'suspended');
select tests.act_as('dir.v@test.zuvio');
select ok(not pg_temp.listed((select s from ids)), 'a suspended user is not listed');
select tests.act_as('dir.s@test.zuvio');
select throws_ok($$ select public.roommate_directory() $$, 'ZV423', null, 'a suspended user cannot browse');
select tests.act_as_owner();
select tests.set_status((select c from ids), 'deleted');
select tests.act_as('dir.v@test.zuvio');
select ok(not pg_temp.listed((select c from ids)), 'a deleted user is not listed');

-- ═════════════ the owner toggles; nobody else can ═════════════
select tests.act_as('dir.b@test.zuvio');
update public.roommate_profiles set directory_visible = false where user_id = (select b from ids);
select tests.act_as('dir.v@test.zuvio');
select ok(not pg_temp.listed((select b from ids)), 'the owner hides their profile -> not listed');
select tests.act_as('dir.b@test.zuvio');
update public.roommate_profiles set directory_visible = true, available = false, show_age_gender = false where user_id = (select b from ids);
select tests.act_as('dir.v@test.zuvio');
select ok(pg_temp.listed((select b from ids)), 'the owner shows it again -> listed');
select is(pg_temp.card((select b from ids)) ->> 'available', 'false', 'the owner marked themselves not available');
select ok(not (pg_temp.card((select b from ids)) ? 'age'), 'the owner turned off age and gender');
select tests.act_as('dir.b@test.zuvio');
update public.roommate_profiles set directory_consent_at = '2001-01-01' where user_id = (select b from ids);
select isnt((select directory_consent_at from public.roommate_profiles where user_id = (select b from ids)), '2001-01-01'::timestamptz,
  'consent time cannot be back-dated by the owner');
update public.roommate_profiles set directory_consent_at = null, directory_visible = true where user_id = (select b from ids);
select is((select directory_visible from public.roommate_profiles where user_id = (select b from ids)), false,
  'withdrawing consent also hides the profile');

select tests.act_as('dir.v@test.zuvio');
update public.roommate_profiles set directory_visible = false, available = false, show_age_gender = false
  where user_id = (select g from ids);
update public.roommate_profiles set directory_consent_at = now(), directory_visible = true
  where user_id = (select e from ids);
select tests.act_as_owner();
select is((select array[directory_visible, available, show_age_gender] from public.roommate_profiles where user_id = (select g from ids)),
  array[true, true, true], 'another user cannot change someone else''s directory flags');
select is((select directory_visible from public.roommate_profiles where user_id = (select e from ids)), false,
  'another user cannot make a hidden profile visible');

-- a suspended owner cannot change their flags (roommate_profiles_update_own requires a usable account)
select tests.act_as('dir.s@test.zuvio');
update public.roommate_profiles set available = false where user_id = (select s from ids);
select tests.act_as_owner();
select is((select available from public.roommate_profiles where user_id = (select s from ids)), true, 'a suspended owner cannot write');

select * from finish();
rollback;
