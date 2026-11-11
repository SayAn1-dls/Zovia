-- Stage 1: sign-up trigger and e-mail / phone sync between auth.users and public.users.
begin;
select * from no_plan();

-- ── a normal sign-up with hostile metadata ──
select tests.create_user('asha@test.zuvio',
  '{"full_name":"  Asha\u0007   Rao \n ","role":"admin","roles":["admin"],"is_admin":true,"status":"suspended","name":"ignored"}'::jsonb);

select is((select count(*)::int from public.users where id = tests.user_id('asha@test.zuvio')), 1, 'users row created');
select is((select email::text from public.users where id = tests.user_id('asha@test.zuvio')), 'asha@test.zuvio', 'e-mail copied');
select is((select status::text from public.users where id = tests.user_id('asha@test.zuvio')), 'active', 'status is active whatever the metadata says');
select is((select display_name from public.user_profiles where user_id = tests.user_id('asha@test.zuvio')), 'Asha Rao',
          'display name taken from full_name, control characters stripped, whitespace collapsed');
select is((select count(*)::int from public.user_preferences where user_id = tests.user_id('asha@test.zuvio')), 1, 'preferences row created');
select is((select array_agg(role::text order by role) from public.user_roles where user_id = tests.user_id('asha@test.zuvio')),
          array['seeker'], 'exactly the seeker role is granted; a role in metadata is ignored');
select is((select onboarding_completed_at from public.users where id = tests.user_id('asha@test.zuvio')), null, 'not onboarded yet');

-- ── display name fallbacks ──
select tests.create_user('ravi@test.zuvio', '{"name":"Ravi Kumar"}'::jsonb);
select is((select display_name from public.user_profiles where user_id = tests.user_id('ravi@test.zuvio')), 'Ravi Kumar', 'falls back to "name"');

select tests.create_user('nometa@test.zuvio');
select is((select display_name from public.user_profiles where user_id = tests.user_id('nometa@test.zuvio')), 'New member', 'default name without metadata');

select lives_ok($$ insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
                   values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'nullmeta@test.zuvio', null) $$,
                'sign-up with NULL metadata does not fail');
select is((select display_name from public.user_profiles where user_id = tests.user_id('nullmeta@test.zuvio')), 'New member', 'default name with NULL metadata');

select lives_ok($$ select tests.create_user('objname@test.zuvio', '{"full_name":{"a":1},"name":["x"]}'::jsonb) $$, 'non-string names do not fail sign-up');
select is((select display_name from public.user_profiles where user_id = tests.user_id('objname@test.zuvio')), 'New member', 'non-string names are ignored');

select lives_ok($$ select tests.create_user('long@test.zuvio', jsonb_build_object('full_name', repeat('Abcdefghi ', 30))) $$, 'a very long name does not fail sign-up');
select cmp_ok((select char_length(display_name) from public.user_profiles where user_id = tests.user_id('long@test.zuvio')), '<=', 60, 'long names are capped at 60 characters');
select is((select display_name = btrim(display_name) from public.user_profiles where user_id = tests.user_id('long@test.zuvio')), true, 'capped name is trimmed');

select lives_ok($$ select tests.create_user('ctrl@test.zuvio', jsonb_build_object('full_name', E'\t\n\r ' || chr(7) || chr(8203))) $$, 'a name made of control characters does not fail sign-up');
select is((select display_name from public.user_profiles where user_id = tests.user_id('ctrl@test.zuvio')), 'New member', 'an empty-after-cleaning name falls back to the default');

select lives_ok($$ select tests.create_user('bidi@test.zuvio', jsonb_build_object('full_name', 'Mal' || chr(8238) || 'lory')) $$, 'bidi override in a name does not fail sign-up');
select is((select display_name from public.user_profiles where user_id = tests.user_id('bidi@test.zuvio')), 'Mal lory', 'bidi override characters are removed');

select lives_ok($$ select tests.create_user('emoji@test.zuvio', '{"full_name":"Zoë 🌱 O''Neil <b>"}'::jsonb) $$, 'unicode and punctuation in a name do not fail sign-up');
select is((select display_name from public.user_profiles where user_id = tests.user_id('emoji@test.zuvio')), 'Zoë 🌱 O''Neil <b>', 'ordinary unicode is kept as typed');

-- ── phone-only user ──
select lives_ok($$ select tests.create_user(null, '{}'::jsonb, '919800000001') $$, 'a phone-only sign-up does not fail');
select is((select count(*)::int from public.users where phone = '919800000001' and email is null), 1, 'phone copied, e-mail null');

-- ── sync on change ──
update auth.users set email = 'asha.new@test.zuvio' where email = 'asha@test.zuvio';
select is((select email::text from public.users where id = tests.user_id('asha.new@test.zuvio')), 'asha.new@test.zuvio', 'e-mail change is mirrored');
select is((select count(*)::int from public.users where email = 'ASHA.NEW@TEST.ZUVIO'), 1, 'e-mail lookup is case-insensitive');

update auth.users set phone = '919800000002', phone_confirmed_at = now() where email = 'ravi@test.zuvio';
select is((select phone from public.users where id = tests.user_id('ravi@test.zuvio')), '919800000002', 'phone change is mirrored');
select isnt((select phone_verified_at from public.users where id = tests.user_id('ravi@test.zuvio')), null, 'phone confirmation is mirrored');

update auth.users set raw_user_meta_data = '{"full_name":"Changed Later","role":"admin"}'::jsonb where email = 'ravi@test.zuvio';
select is((select display_name from public.user_profiles where user_id = tests.user_id('ravi@test.zuvio')), 'Ravi Kumar', 'later metadata changes never touch the profile');
select is((select count(*)::int from public.user_roles where user_id = tests.user_id('ravi@test.zuvio')), 1, 'later metadata changes never grant roles');

-- ── deleting the auth user removes the public rows ──
create temp table gone as select tests.user_id('nometa@test.zuvio') as id;
delete from auth.users where email = 'nometa@test.zuvio';
select is((select count(*)::int from public.users u join gone g on g.id = u.id), 0, 'users row cascades with the auth user');
select is((select count(*)::int from public.user_profiles p join gone g on g.id = p.user_id), 0, 'profile cascades');
select is((select count(*)::int from public.user_roles r join gone g on g.id = r.user_id), 0, 'roles cascade');

select * from finish();
rollback;
