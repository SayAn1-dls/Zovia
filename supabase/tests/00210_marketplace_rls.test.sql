-- Stage 2: who can see and change listings and their children. Anonymous, another user, another
-- owner, the owner, a suspended owner, a restricted owner, moderator, admin, service_role.
begin;
select * from no_plan();

select tests.create_user('o1@test.zuvio', '{"full_name":"Owner One"}'::jsonb);
select tests.create_user('o2@test.zuvio', '{"full_name":"Owner Two"}'::jsonb);
select tests.create_user('seeker@test.zuvio', '{"full_name":"Seeker"}'::jsonb);
select tests.create_user('mod@test.zuvio', '{"full_name":"Moderator"}'::jsonb);
select tests.create_user('admin@test.zuvio', '{"full_name":"Admin"}'::jsonb);
select tests.create_user('susp@test.zuvio', '{"full_name":"Suspended Owner"}'::jsonb);
select tests.create_user('restr@test.zuvio', '{"full_name":"Restricted Owner"}'::jsonb);
select tests.create_user('gone@test.zuvio', '{"full_name":"Gone Owner"}'::jsonb);
select tests.grant_role(tests.user_id('mod@test.zuvio'), 'moderator');
select tests.grant_role(tests.user_id('admin@test.zuvio'), 'admin');
select tests.make_owner(tests.user_id('o1@test.zuvio'));
select tests.make_owner(tests.user_id('o2@test.zuvio'));
select tests.make_owner(tests.user_id('susp@test.zuvio'));
select tests.make_owner(tests.user_id('restr@test.zuvio'));
select tests.make_owner(tests.user_id('gone@test.zuvio'));
update public.property_owners set business_name = 'One Stays', contact_phone = '9876543210', contact_email = 'one@stays.test', whatsapp_number = '+919876543210'
  where user_id = tests.user_id('o1@test.zuvio');

create temp table ids as
  select tests.user_id('o1@test.zuvio') as o1, tests.user_id('o2@test.zuvio') as o2, tests.user_id('seeker@test.zuvio') as s,
         tests.user_id('mod@test.zuvio') as m, tests.user_id('admin@test.zuvio') as d, tests.user_id('susp@test.zuvio') as su,
         tests.user_id('restr@test.zuvio') as re, tests.user_id('gone@test.zuvio') as g;
grant select on ids to anon, authenticated, service_role;
create temp table memo (k text primary key, v text);
grant all on memo to anon, authenticated, service_role;
create function pg_temp.m(p_k text) returns uuid language sql stable as 'select v::uuid from memo where k = p_k';
grant execute on function pg_temp.m(text) to anon, authenticated, service_role;

-- o1: one published listing (pub) and one draft (draft); o2: one draft (o2draft); susp / restr: one draft each
insert into memo select 'pub', tests.create_property((select o1 from ids), 'Published PG')::text;
insert into memo select 'draft', tests.create_property((select o1 from ids), 'Draft PG')::text;
insert into memo select 'o2draft', tests.create_property((select o2 from ids), 'Other Draft')::text;
insert into memo select 'sudraft', tests.create_property((select su from ids), 'Suspended Draft')::text;
insert into memo select 'redraft', tests.create_property((select re from ids), 'Restricted Draft')::text;

with x as (insert into public.rooms (property_id, name, capacity, rent_per_bed) values (pg_temp.m('pub'), 'P1', 2, 9000) returning id)
  insert into memo select 'pub_room', id::text from x;
with x as (insert into public.rooms (property_id, name, capacity, rent_per_bed, deleted_at) values (pg_temp.m('pub'), 'P-old', 2, 9000, now()) returning id)
  insert into memo select 'pub_room_deleted', id::text from x;
with x as (insert into public.rooms (property_id, name, capacity, rent_per_bed) values (pg_temp.m('draft'), 'D1', 2, 7000) returning id)
  insert into memo select 'draft_room', id::text from x;
with x as (insert into public.beds (room_id, label) values (pg_temp.m('pub_room'), 'A') returning id) insert into memo select 'pub_bed', id::text from x;
insert into public.beds (room_id, label) values (pg_temp.m('pub_room_deleted'), 'Z');
with x as (insert into public.beds (room_id, label) values (pg_temp.m('draft_room'), 'A') returning id) insert into memo select 'draft_bed', id::text from x;
insert into public.property_amenities (property_id, amenity_code) values (pg_temp.m('pub'), 'wifi'), (pg_temp.m('draft'), 'wifi');
with x as (insert into public.property_media (property_id, storage_path, is_cover) values (pg_temp.m('pub'), pg_temp.m('pub')::text || '/1.webp', true) returning id)
  insert into memo select 'pub_media', id::text from x;
with x as (insert into public.property_media (property_id, storage_path) values (pg_temp.m('draft'), pg_temp.m('draft')::text || '/1.webp') returning id)
  insert into memo select 'draft_media', id::text from x;
insert into public.property_rules (property_id, rule_code, allowed) values (pg_temp.m('pub'), 'smoking', false), (pg_temp.m('draft'), 'smoking', false);
insert into public.property_charges (property_id, label, amount) values (pg_temp.m('pub'), 'Laundry', 500), (pg_temp.m('draft'), 'Laundry', 500);
insert into public.property_verifications (property_id, kind, status, verified_at) values
  (pg_temp.m('pub'), 'authorisation', 'verified', now()), (pg_temp.m('draft'), 'authorisation', 'pending', null);
insert into public.places (kind, name, city, location, source, source_ref)
  values ('metro_station', 'Test Metro', 'Bengaluru', extensions.st_setsrid(extensions.st_makepoint(77.62, 12.93), 4326)::extensions.geography, 'test', 'm1');
insert into public.property_nearby_places (property_id, place_id, straight_line_m)
  select p, (select id from public.places where source_ref = 'm1'), 400 from (values (pg_temp.m('pub')), (pg_temp.m('draft'))) v(p);
insert into public.property_stats_daily (property_id, day, views) values (pg_temp.m('pub'), current_date, 5), (pg_temp.m('o2draft'), current_date, 1);
insert into public.property_inquiries (property_id, seeker_id, message) values (pg_temp.m('pub'), (select s from ids), 'Is a bed free in December?');
insert into public.contact_reveals (user_id, property_id) values ((select s from ids), pg_temp.m('pub'));
select tests.set_listing_status(pg_temp.m('pub'), 'published');
select tests.set_status((select su from ids), 'suspended');
insert into public.user_restrictions (user_id, kind, reason) values ((select re from ids), 'listing', 'test restriction');
update public.users set status = 'restricted' where id = (select re from ids);

-- ═════════════ anonymous: only what is published ═════════════
select tests.act_as_anon();
select is((select count(*)::int from public.properties), 1, 'anon sees exactly the published listing');
select is((select id from public.properties), pg_temp.m('pub'), 'and it is the published one');
select is((select count(*)::int from public.rooms), 1, 'anon sees the published listing''s live room only (not drafts, not soft-deleted rooms)');
select is((select count(*)::int from public.beds), 1, 'anon sees only beds of visible rooms');
select is((select count(*)::int from public.property_amenities), 1, 'anon: amenities of published only');
select is((select count(*)::int from public.property_media), 1, 'anon: media of published only');
select is((select count(*)::int from public.property_rules), 1, 'anon: rules of published only');
select is((select count(*)::int from public.property_charges), 1, 'anon: charges of published only');
select is((select count(*)::int from public.property_availability), 1, 'anon: availability of published only');
select is((select count(*)::int from public.property_verifications), 1, 'anon: verification signals of published only');
select is((select count(*)::int from public.property_nearby_places), 1, 'anon: nearby places of published only');
select is((select count(*)::int from public.places), 1, 'anon reads places');
select is((select count(*)::int from public.cities), 15, 'anon reads cities');
select is((select count(*)::int from public.amenities), 24, 'anon reads amenities');
select throws_ok('select * from public.property_owners', '42501', null, 'anon cannot read property_owners (contact details)');
select throws_ok('select * from public.property_inquiries', '42501', null, 'anon cannot read enquiries');
select throws_ok('select * from public.saved_properties', '42501', null, 'anon cannot read saved_properties');
select throws_ok('select * from public.contact_reveals', '42501', null, 'anon cannot read contact_reveals');
select throws_ok('select * from public.verification_records', '42501', null, 'anon cannot read verification_records');
select throws_ok('select * from public.property_stats_daily', '42501', null, 'anon cannot read stats');
select throws_ok($$ insert into public.properties (owner_id, title, property_type, listing_mode) values ((select o1 from ids), 'Anon listing', 'pg', 'per_bed') $$, '42501', null, 'anon cannot create a listing');
select throws_ok($$ update public.properties set title = 'Hacked' $$, '42501', null, 'anon cannot update listings');
select throws_ok($$ delete from public.properties $$, '42501', null, 'anon cannot delete listings');
select throws_ok($$ update public.beds set status = 'occupied' $$, '42501', null, 'anon cannot update beds');
select throws_ok($$ insert into public.places (kind, name, location, source, source_ref) values ('gym', 'x', extensions.st_setsrid(extensions.st_makepoint(77.6, 12.9), 4326)::extensions.geography, 'test', 'x') $$, '42501', null, 'anon cannot write places');
-- owner cards: no contact details
select is((select display_name from public.property_owner_cards where user_id = (select o1 from ids)), 'One Stays', 'anon reads the owner card (business name)');
select is((select display_name from public.property_owner_cards where user_id = (select o2 from ids)), 'Owner Two', 'card falls back to the profile name');
select is((select array_agg(a.attname::text order by a.attnum) from pg_attribute a where a.attrelid = 'public.property_owner_cards'::regclass and a.attnum > 0),
          array['user_id','display_name','owner_type','verification_status','verified_at','member_since'], 'the owner card has exactly the six safe columns');

-- ═════════════ a signed-in seeker ═════════════
select tests.act_as('seeker@test.zuvio');
select is((select count(*)::int from public.properties), 1, 'seeker sees only the published listing');
select is((select count(*)::int from public.rooms), 1, 'seeker: live rooms of published only');
select is((select count(*)::int from public.beds), 1, 'seeker: beds of published only');
select is((select count(*)::int from public.property_media), 1, 'seeker: media of published only');
select is((select count(*)::int from public.property_owners), 0, 'seeker reads no property_owners row (contact details stay private)');
select is((select count(*)::int from public.property_stats_daily), 0, 'seeker reads no stats');
select is((select count(*)::int from public.property_inquiries), 1, 'seeker reads their own enquiry');
select is((select count(*)::int from public.contact_reveals), 1, 'seeker reads their own contact reveals');
select throws_ok($$ insert into public.properties (owner_id, title, property_type, listing_mode) values ((select s from ids), 'Not an owner', 'pg', 'per_bed') $$,
                 '42501', null, 'a user who is not a registered owner cannot create a listing');
select throws_ok($$ insert into public.properties (owner_id, title, property_type, listing_mode) values ((select o1 from ids), 'For someone else', 'pg', 'per_bed') $$,
                 '42501', null, 'a user cannot create a listing for another owner');
select throws_ok($$ insert into public.property_inquiries (property_id, seeker_id, message) values (pg_temp.m('pub'), (select s from ids), 'direct insert') $$,
                 '42501', null, 'enquiries cannot be inserted directly');
select throws_ok($$ update public.property_inquiries set status = 'responded' $$, '42501', null, 'enquiries cannot be updated directly');
select throws_ok($$ insert into public.contact_reveals (user_id, property_id) values ((select s from ids), pg_temp.m('pub')) $$, '42501', null, 'contact reveals cannot be inserted directly');
select throws_ok($$ insert into public.property_stats_daily (property_id, day, views) values (pg_temp.m('pub'), current_date - 1, 99) $$, '42501', null, 'stats cannot be written by clients');
-- saved properties
select lives_ok($$ insert into public.saved_properties (user_id, property_id) values ((select s from ids), pg_temp.m('pub')) $$, 'seeker saves a published listing');
select throws_ok($$ insert into public.saved_properties (user_id, property_id) values ((select s from ids), pg_temp.m('draft')) $$, '42501', null, 'a draft cannot be saved');
select throws_ok($$ insert into public.saved_properties (user_id, property_id) values ((select o2 from ids), pg_temp.m('pub')) $$, '42501', null, 'cannot save on behalf of another user');
select is((select count(*)::int from public.saved_properties), 1, 'seeker sees their saved listing');
-- seeker cannot touch someone's published listing
update public.properties set title = 'Hacked' where id = pg_temp.m('pub');
update public.rooms set rent_per_bed = 1 where id = pg_temp.m('pub_room');
update public.beds set status = 'occupied' where id = pg_temp.m('pub_bed');
delete from public.property_media where id = pg_temp.m('pub_media');
delete from public.beds where id = pg_temp.m('pub_bed');
update public.property_availability set min_stay_months = 1 where property_id = pg_temp.m('pub');
select tests.act_as_owner();
select is((select title from public.properties where id = pg_temp.m('pub')), 'Published PG', 'a non-owner''s update of a published listing changes nothing');
select is((select rent_per_bed from public.rooms where id = pg_temp.m('pub_room')), 9000, 'a non-owner cannot change a room');
select is((select status::text from public.beds where id = pg_temp.m('pub_bed')), 'available', 'a non-owner cannot change or delete a bed');
select is((select count(*)::int from public.property_media where id = pg_temp.m('pub_media')), 1, 'a non-owner cannot delete media');
select is((select min_stay_months from public.property_availability where property_id = pg_temp.m('pub')), null, 'a non-owner cannot change availability');

-- ═════════════ another owner (o2) against o1's draft ═════════════
select tests.act_as('o2@test.zuvio');
select is((select count(*)::int from public.properties where id = pg_temp.m('draft')), 0, 'o2 cannot read o1''s draft');
select is((select count(*)::int from public.rooms where property_id = pg_temp.m('draft')), 0, 'o2 cannot read rooms of o1''s draft');
select is((select count(*)::int from public.beds where property_id = pg_temp.m('draft')), 0, 'o2 cannot read beds of o1''s draft');
select is((select count(*)::int from public.property_media where property_id = pg_temp.m('draft')), 0, 'o2 cannot read media of o1''s draft');
select is((select count(*)::int from public.property_amenities where property_id = pg_temp.m('draft')), 0, 'o2 cannot read amenities of o1''s draft');
select is((select count(*)::int from public.property_rules where property_id = pg_temp.m('draft')), 0, 'o2 cannot read rules of o1''s draft');
select is((select count(*)::int from public.property_charges where property_id = pg_temp.m('draft')), 0, 'o2 cannot read charges of o1''s draft');
select is((select count(*)::int from public.property_availability where property_id = pg_temp.m('draft')), 0, 'o2 cannot read availability of o1''s draft');
select is((select count(*)::int from public.property_verifications where property_id = pg_temp.m('draft')), 0, 'o2 cannot read verifications of o1''s draft');
select is((select count(*)::int from public.property_nearby_places where property_id = pg_temp.m('draft')), 0, 'o2 cannot read nearby places of o1''s draft');
select is((select count(*)::int from public.property_owners), 1, 'o2 reads only their own property_owners row');
select is((select count(*)::int from public.property_inquiries), 0, 'o2 reads no enquiry of o1''s listing');
select is((select count(*)::int from public.property_stats_daily), 1, 'o2 reads stats of their own listing only');
update public.properties set title = 'Stolen' where id = pg_temp.m('draft');
delete from public.properties where id = pg_temp.m('draft');
update public.rooms set name = 'Stolen' where id = pg_temp.m('draft_room');
delete from public.rooms where id = pg_temp.m('draft_room');
update public.beds set label = 'Stolen' where id = pg_temp.m('draft_bed');
delete from public.beds where id = pg_temp.m('draft_bed');
update public.property_media set alt_text = 'Stolen' where id = pg_temp.m('draft_media');
delete from public.property_media where id = pg_temp.m('draft_media');
delete from public.property_amenities where property_id = pg_temp.m('draft');
delete from public.property_rules where property_id = pg_temp.m('draft');
delete from public.property_charges where property_id = pg_temp.m('draft');
select throws_ok($$ insert into public.rooms (property_id, name) values (pg_temp.m('draft'), 'Intruder room') $$, '42501', null, 'o2 cannot add a room to o1''s draft');
select throws_ok($$ insert into public.beds (room_id, label) values (pg_temp.m('draft_room'), 'X') $$, '42501', null, 'o2 cannot add a bed to o1''s room');
select throws_ok($$ insert into public.beds (room_id, property_id, label) values (pg_temp.m('draft_room'), pg_temp.m('o2draft'), 'X') $$, '42501', null,
                 'o2 cannot smuggle a bed into o1''s room by claiming their own property_id');
select throws_ok($$ insert into public.property_media (property_id, storage_path) values (pg_temp.m('draft'), pg_temp.m('draft')::text || '/x.webp') $$, '42501', null, 'o2 cannot add media to o1''s draft');
select throws_ok($$ insert into public.property_amenities (property_id, amenity_code) values (pg_temp.m('draft'), 'ac') $$, '42501', null, 'o2 cannot add amenities to o1''s draft');
select throws_ok($$ insert into public.property_rules (property_id, rule_code, allowed) values (pg_temp.m('draft'), 'pets', true) $$, '42501', null, 'o2 cannot add rules to o1''s draft');
select throws_ok($$ insert into public.property_charges (property_id, label, amount) values (pg_temp.m('draft'), 'Fee', 1) $$, '42501', null, 'o2 cannot add charges to o1''s draft');
select throws_ok($$ insert into public.rooms (property_id, name) values (pg_temp.m('pub'), 'Intruder room') $$, '42501', null, 'o2 cannot add a room to o1''s published listing');
select throws_ok($$ update public.properties set owner_id = (select o2 from ids) where id = pg_temp.m('o2draft') $$, '42501', null, 'owner_id is not writable');
select throws_ok($$ update public.property_owners set verification_status = 'verified', verified_at = now() where user_id = (select o2 from ids) $$, '42501', null,
                 'an owner cannot verify themselves');
select throws_ok($$ update public.property_owners set phone_verified_at = now() where user_id = (select o2 from ids) $$, '42501', null, 'an owner cannot mark their phone verified');
select throws_ok($$ insert into public.property_owners (user_id) values ((select o2 from ids)) $$, '42501', null, 'property_owners has no client insert');
select throws_ok($$ insert into public.property_verifications (property_id, kind, status, verified_at) values (pg_temp.m('o2draft'), 'authorisation', 'verified', now()) $$, '42501', null,
                 'an owner cannot write verification signals');
update public.property_owners set business_name = 'Hijacked' where user_id = (select o1 from ids);
select tests.act_as_owner();
select is((select title from public.properties where id = pg_temp.m('draft')), 'Draft PG', 'o2 could not change or delete o1''s draft');
select is((select name from public.rooms where id = pg_temp.m('draft_room')), 'D1', 'o2 could not change or delete o1''s room');
select is((select label from public.beds where id = pg_temp.m('draft_bed')), 'A', 'o2 could not change or delete o1''s bed');
select is((select alt_text from public.property_media where id = pg_temp.m('draft_media')), null, 'o2 could not change or delete o1''s media');
select is((select count(*)::int from public.property_amenities where property_id = pg_temp.m('draft')), 1, 'o2 could not delete o1''s amenities');
select is((select count(*)::int from public.property_rules where property_id = pg_temp.m('draft')), 1, 'o2 could not delete o1''s rules');
select is((select count(*)::int from public.property_charges where property_id = pg_temp.m('draft')), 1, 'o2 could not delete o1''s charges');
select is((select business_name from public.property_owners where user_id = (select o1 from ids)), 'One Stays', 'o2 could not edit o1''s owner profile');

-- ═════════════ the owner (o1): full control of own listings in any status ═════════════
select tests.act_as('o1@test.zuvio');
select is((select count(*)::int from public.properties), 2, 'o1 sees both own listings (published and draft), nobody else''s drafts');
select is((select count(*)::int from public.rooms), 3, 'o1 sees own rooms including the soft-deleted one');
select is((select count(*)::int from public.beds), 3, 'o1 sees own beds including the one in the soft-deleted room');
select is((select contact_phone from public.property_owners), '9876543210', 'o1 reads their own contact details');
select is((select count(*)::int from public.property_inquiries), 1, 'o1 reads the enquiry on their listing');
select is((select count(*)::int from public.contact_reveals), 0, 'o1 does not read who revealed their contact');
select is((select views from public.property_stats_daily), 5, 'o1 reads stats of their own listing only');
select lives_ok($$ update public.properties set description = 'Bright rooms near the park', tenant_gender = 'female', food_available = true, food_monthly_charge = 3000 where id = pg_temp.m('draft') $$, 'o1 edits their draft');
select lives_ok($$ update public.properties set description = 'Updated while live' where id = pg_temp.m('pub') $$, 'o1 edits their published listing');
select lives_ok($$ insert into public.rooms (property_id, name, capacity, rent_per_bed) values (pg_temp.m('draft'), 'D2', 3, 6500) $$, 'o1 adds a room');
select lives_ok($$ insert into public.beds (room_id, label) select id, 'A' from public.rooms where name = 'D2' $$, 'o1 adds a bed (property_id filled in by trigger)');
select is((select b.property_id from public.beds b join public.rooms r on r.id = b.room_id where r.name = 'D2'), pg_temp.m('draft'), 'the bed carries its room''s property_id');
select lives_ok($$ update public.beds set status = 'occupied' where id = pg_temp.m('draft_bed') $$, 'o1 updates a bed');
select lives_ok($$ update public.rooms set deleted_at = now() where name = 'D2' $$, 'o1 soft-deletes a room');
select lives_ok($$ insert into public.property_amenities (property_id, amenity_code) values (pg_temp.m('draft'), 'ac') $$, 'o1 adds an amenity');
select lives_ok($$ insert into public.property_media (property_id, storage_path) values (pg_temp.m('draft'), pg_temp.m('draft')::text || '/2.webp') $$, 'o1 adds media');
select lives_ok($$ update public.property_media set is_cover = true where id = pg_temp.m('draft_media') $$, 'o1 picks a cover');
select lives_ok($$ insert into public.property_rules (property_id, rule_code, allowed) values (pg_temp.m('draft'), 'pets', true) $$, 'o1 adds a rule');
select lives_ok($$ update public.property_charges set amount = 600 where property_id = pg_temp.m('draft') $$, 'o1 updates a charge');
select lives_ok($$ update public.property_availability set min_stay_months = 3, notice_period_days = 30 where property_id = pg_temp.m('draft') $$, 'o1 updates availability terms');
select lives_ok($$ update public.property_owners set about = 'Family-run PGs since 2015', whatsapp_number = '9876543210' where user_id = (select o1 from ids) $$, 'o1 edits their owner profile');
select throws_ok($$ update public.properties set status = 'published' where id = pg_temp.m('draft') $$, '42501', null, 'o1 cannot write status');
select throws_ok($$ update public.properties set min_rent = 1 where id = pg_temp.m('pub') $$, '42501', null, 'o1 cannot write denormalised columns');
select throws_ok($$ update public.properties set rating_avg = 5, rating_count = 100 where id = pg_temp.m('pub') $$, '42501', null, 'o1 cannot fake ratings');
select throws_ok($$ update public.properties set last_confirmed_at = now() where id = pg_temp.m('pub') $$, '42501', null, 'o1 cannot stamp last_confirmed_at directly');
select throws_ok($$ update public.properties set deleted_at = now() where id = pg_temp.m('pub') $$, '42501', null, 'o1 cannot soft-delete directly');
select throws_ok($$ insert into public.properties (owner_id, title, property_type, listing_mode, status) values ((select o1 from ids), 'Self-published', 'pg', 'per_bed', 'published') $$,
                 '42501', null, 'o1 cannot insert a listing with a status');
select throws_ok($$ update public.rooms set property_id = pg_temp.m('pub') where id = pg_temp.m('draft_room') $$, '42501', null, 'a room cannot be moved to another property');
select throws_ok($$ update public.property_availability set last_confirmed_at = now() where property_id = pg_temp.m('pub') $$, '42501', null, 'o1 cannot stamp availability confirmation directly');
-- delete: drafts only
delete from public.properties where id = pg_temp.m('pub');
select is((select count(*)::int from public.properties where id = pg_temp.m('pub')), 1, 'a published listing cannot be hard-deleted by its owner');
with x as (insert into public.properties (owner_id, title, property_type, listing_mode) values ((select o1 from ids), 'Throwaway draft', 'studio', 'entire_unit') returning id)
  insert into memo select 'throwaway', id::text from x;
select is((select status::text from public.properties where id = pg_temp.m('throwaway')), 'draft', 'a new listing is a draft');
delete from public.properties where id = pg_temp.m('throwaway');
select is((select count(*)::int from public.properties where id = pg_temp.m('throwaway')), 0, 'the owner deletes their own draft');

-- ═════════════ suspended and restricted owners ═════════════
select tests.act_as('susp@test.zuvio');
select is((select count(*)::int from public.properties where id = pg_temp.m('sudraft')), 1, 'a suspended owner still reads their listing');
update public.properties set title = 'Edited while suspended' where id = pg_temp.m('sudraft');
select throws_ok($$ insert into public.properties (owner_id, title, property_type, listing_mode) values ((select su from ids), 'New while suspended', 'pg', 'per_bed') $$, '42501', null,
                 'a suspended owner cannot create listings');
select throws_ok($$ insert into public.rooms (property_id, name) values (pg_temp.m('sudraft'), 'Room') $$, '42501', null, 'a suspended owner cannot add rooms');
delete from public.properties where id = pg_temp.m('sudraft');
select tests.act_as('restr@test.zuvio');
update public.properties set title = 'Edited while restricted' where id = pg_temp.m('redraft');
select throws_ok($$ insert into public.properties (owner_id, title, property_type, listing_mode) values ((select re from ids), 'New while restricted', 'pg', 'per_bed') $$, '42501', null,
                 'an owner with a listing restriction cannot create listings');
select throws_ok($$ insert into public.rooms (property_id, name) values (pg_temp.m('redraft'), 'Room') $$, '42501', null, 'an owner with a listing restriction cannot add rooms');
select tests.act_as_owner();
select is((select title from public.properties where id = pg_temp.m('sudraft')), 'Suspended Draft', 'a suspended owner can neither edit nor delete');
select is((select title from public.properties where id = pg_temp.m('redraft')), 'Restricted Draft', 'an owner with a listing restriction cannot edit');

-- ═════════════ staff: read everything, write nothing directly ═════════════
select tests.act_as('mod@test.zuvio');
select is((select count(*)::int from public.properties), 5, 'moderator reads every listing in every status');
select is((select count(*)::int from public.rooms where property_id = pg_temp.m('draft')), 2, 'moderator reads rooms of drafts, soft-deleted included');
select cmp_ok((select count(*)::int from public.property_owners), '>=', 5, 'moderator reads owner profiles');
select is((select count(*)::int from public.property_inquiries), 1, 'moderator reads enquiries');
select is((select count(*)::int from public.contact_reveals), 1, 'moderator reads contact reveals');
select is((select count(*)::int from public.property_stats_daily), 2, 'moderator reads stats');
update public.properties set title = 'Edited by staff' where id = pg_temp.m('draft');
select throws_ok($$ update public.properties set status = 'published' where id = pg_temp.m('draft') $$, '42501', null, 'a moderator cannot publish by direct update (admin function only)');
select throws_ok($$ update public.property_owners set verification_status = 'verified', verified_at = now() where user_id = (select o1 from ids) $$, '42501', null,
                 'a moderator cannot verify an owner by direct update');
select tests.act_as('admin@test.zuvio');
select is((select count(*)::int from public.properties), 5, 'admin reads every listing');
select throws_ok($$ update public.properties set status = 'published' where id = pg_temp.m('draft') $$, '42501', null, 'an admin cannot publish by direct update either');
delete from public.properties where id = pg_temp.m('draft');
select tests.act_as_owner();
select is((select title from public.properties where id = pg_temp.m('draft')), 'Draft PG', 'staff cannot edit or delete listings directly');

-- ═════════════ soft-deleted listing and deleted owner ═════════════
set local zuvio.listing_actor = 'system';
update public.properties set deleted_at = now() where id = pg_temp.m('pub');
set local zuvio.listing_actor = '';
select tests.act_as_anon();
select is((select count(*)::int from public.properties), 0, 'a soft-deleted published listing is hidden from the public');
select is((select count(*)::int from public.rooms), 0, 'and so are its rooms');
select tests.act_as_owner();
select tests.set_status((select g from ids), 'deleted');
select tests.act_as_anon();
select is((select count(*)::int from public.property_owner_cards where user_id = (select g from ids)), 0, 'a deleted account has no owner card');

-- ═════════════ service_role: trusted writer of places ═════════════
select tests.act_as_service();
select lives_ok($$ insert into public.places (kind, name, city, location, source, source_ref) values ('college', 'Test College', 'Bengaluru', extensions.st_setsrid(extensions.st_makepoint(77.61, 12.94), 4326)::extensions.geography, 'test', 'c1') $$,
                'service_role writes places');
select lives_ok($$ insert into public.property_nearby_places (property_id, place_id, straight_line_m) select pg_temp.m('draft'), id, 900 from public.places where source_ref = 'c1' $$,
                'service_role writes nearby places');
select throws_ok($$ insert into public.places (kind, name, location, source, source_ref) values ('college', 'Dup', extensions.st_setsrid(extensions.st_makepoint(77.61, 12.94), 4326)::extensions.geography, 'test', 'c1') $$,
                 '23505', null, 'a place is unique per source and source_ref');

select * from finish();
rollback;
