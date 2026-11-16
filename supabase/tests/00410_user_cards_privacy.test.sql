-- public_user_cards is need-to-know: nobody can list the user base, but every screen that shows a
-- name (property reviews, owner dashboard, bookings, roommate matches, chat headers) still can.
begin;
select * from no_plan();

select tests.create_user('owner@test.zuvio', '{"full_name":"Owner"}'::jsonb);
select tests.create_user('rev@test.zuvio', '{"full_name":"Public Reviewer"}'::jsonb);
select tests.create_user('hid@test.zuvio', '{"full_name":"Hidden Reviewer"}'::jsonb);
select tests.create_user('draftrev@test.zuvio', '{"full_name":"Draft Reviewer"}'::jsonb);
select tests.create_user('gone@test.zuvio', '{"full_name":"Gone Reviewer"}'::jsonb);
select tests.create_user('enq@test.zuvio', '{"full_name":"Enquirer"}'::jsonb);
select tests.create_user('bk@test.zuvio', '{"full_name":"Booker"}'::jsonb);
select tests.create_user('ma@test.zuvio', '{"full_name":"Match A"}'::jsonb);
select tests.create_user('mb@test.zuvio', '{"full_name":"Match B"}'::jsonb);
select tests.create_user('stranger@test.zuvio', '{"full_name":"Stranger"}'::jsonb);
select tests.create_user('mod@test.zuvio', '{"full_name":"Moderator"}'::jsonb);
select tests.grant_role(tests.user_id('mod@test.zuvio'), 'moderator');
select tests.make_owner(tests.user_id('owner@test.zuvio'));

create temp table ids as
  select tests.user_id('owner@test.zuvio') as o, tests.user_id('rev@test.zuvio') as rev, tests.user_id('hid@test.zuvio') as hid,
         tests.user_id('draftrev@test.zuvio') as dr, tests.user_id('gone@test.zuvio') as g, tests.user_id('enq@test.zuvio') as enq,
         tests.user_id('bk@test.zuvio') as bk, tests.user_id('ma@test.zuvio') as ma, tests.user_id('mb@test.zuvio') as mb,
         tests.user_id('stranger@test.zuvio') as x;
grant select on ids to anon, authenticated, service_role;
create temp table memo (k text primary key, v text);
grant all on memo to anon, authenticated, service_role;
create function pg_temp.m(p_k text) returns uuid language sql stable as 'select v::uuid from memo where k = p_k';
grant execute on function pg_temp.m(text) to anon, authenticated, service_role;
create function pg_temp.sees(p_user uuid) returns boolean language sql stable as
  'select exists (select 1 from public.public_user_cards where user_id = p_user)';
grant execute on function pg_temp.sees(uuid) to anon, authenticated, service_role;

-- ── fixtures (as the table owner, past RLS) ──
insert into memo select 'pub', tests.create_property((select o from ids), 'Public PG')::text;
insert into memo select 'draft', tests.create_property((select o from ids), 'Draft PG')::text;
select tests.set_listing_status(pg_temp.m('pub'), 'published');

insert into public.property_inquiries (property_id, seeker_id, message)
  select pg_temp.m('pub'), u, 'Is a bed free next month?' from ids, unnest(array[ids.rev, ids.hid, ids.g, ids.enq]) u;
insert into public.property_inquiries (property_id, seeker_id, message) select pg_temp.m('draft'), dr, 'Hello?' from ids;
insert into public.property_reviews (property_id, author_id, rating, body, status)
  select pg_temp.m('pub'), rev, 5, 'Clean rooms and good food.', 'published'::public.review_status from ids
  union all select pg_temp.m('pub'), hid, 1, 'Hidden by a moderator.', 'hidden' from ids
  union all select pg_temp.m('pub'), g, 4, 'Written before the account was deleted.', 'published' from ids
  union all select pg_temp.m('draft'), dr, 3, 'On a listing that is not public.', 'published' from ids;
select tests.set_status((select g from ids), 'deleted');

insert into public.bookings (property_id, seeker_id, owner_id, move_in_date, stay_months, amount_inr, amount_kind, monthly_rent_inr, respond_by)
  select pg_temp.m('pub'), bk, o, current_date + 14, 6, 9000, 'security_deposit', 9000, now() + interval '2 days' from ids;

with mt as (insert into public.roommate_matches (user_a, user_b)
            select least(ma, mb), greatest(ma, mb) from ids returning id)
  insert into memo select 'match', id::text from mt;
with c as (insert into public.conversations (kind, match_id) values ('roommate_match', pg_temp.m('match')) returning id)
  insert into memo select 'conv', id::text from c;
update public.roommate_matches set conversation_id = pg_temp.m('conv') where id = pg_temp.m('match');
insert into public.conversation_members (conversation_id, user_id) select pg_temp.m('conv'), u from ids, unnest(array[ids.ma, ids.mb]) u;

-- ── anonymous: published reviewers on public listings, nobody else ──
select tests.act_as_anon();
select is((select array_agg(display_name order by display_name) from public.public_user_cards), array['Public Reviewer'],
          'anon sees exactly one card: the author of a published review on a published listing');
select is(pg_temp.sees((select hid from ids)), false, 'anon cannot see the author of a hidden review');
select is(pg_temp.sees((select dr from ids)), false, 'anon cannot see a reviewer on a listing that is not public');
select is(pg_temp.sees((select g from ids)), false, 'a deleted account has no card, even with a published review');
select is(pg_temp.sees((select o from ids)), false, 'anon cannot see the owner''s personal card (owners show through property_owner_cards)');

-- ── a stranger: themselves and public reviewers ──
select tests.act_as('stranger@test.zuvio');
select is((select count(*)::int from public.public_user_cards), 2, 'a stranger sees only their own card and the public reviewer');
select is(pg_temp.sees((select x from ids)), true, 'a user sees their own card');
select is(pg_temp.sees(u), false, 'a stranger cannot see enquirers, bookers, matches or hidden reviewers')
  from ids, unnest(array[ids.enq, ids.bk, ids.ma, ids.mb, ids.hid, ids.o]) u;

-- ── the owner: everyone who dealt with their listings ──
select tests.act_as('owner@test.zuvio');
select is(pg_temp.sees((select enq from ids)), true, 'the owner sees an enquirer on their listing');
select is(pg_temp.sees((select bk from ids)), true, 'the owner sees a seeker who booked their listing');
select is(pg_temp.sees((select hid from ids)), true, 'the owner sees the author of a hidden review on their listing');
select is(pg_temp.sees((select dr from ids)), true, 'the owner sees a reviewer on their own draft listing');
select is(pg_temp.sees((select ma from ids)), false, 'the owner cannot see unrelated roommate seekers');

-- ── the other side of an enquiry or booking sees the owner ──
select tests.act_as('enq@test.zuvio');
select is(pg_temp.sees((select o from ids)), true, 'an enquirer sees the owner of the listing');
select is(pg_temp.sees((select bk from ids)), false, 'an enquirer cannot see another seeker of the same listing');
select tests.act_as('bk@test.zuvio');
select is(pg_temp.sees((select o from ids)), true, 'a booker sees the owner of the listing');

-- ── roommate matches and their chat ──
select tests.act_as('ma@test.zuvio');
select is((select display_name from public.public_user_cards c, ids where c.user_id = ids.mb), 'Match B', 'a match sees the other person''s card');
select is((select other_display_name from public.my_conversations(30, 0)), 'Match B', 'the chat list still shows the other person''s name');
select tests.act_as('mb@test.zuvio');
select is(pg_temp.sees((select ma from ids)), true, 'and the other way round');

-- ── staff: everyone except deleted accounts ──
select tests.act_as('mod@test.zuvio');
select is((select count(*)::int from public.public_user_cards c, ids where c.user_id in (ids.o, ids.enq, ids.bk, ids.ma, ids.x)), 5, 'staff see every card');
select is(pg_temp.sees((select g from ids)), false, 'staff do not see a deleted account''s card either');

select tests.act_as_owner();
select * from finish();
rollback;
