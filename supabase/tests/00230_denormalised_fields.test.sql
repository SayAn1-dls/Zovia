-- Stage 2: bed capacity, bed/room consistency, single cover, row caps, and the denormalised
-- search fields + derived availability through inserts, updates and deletes.
begin;
select * from no_plan();

select tests.create_user('o1@test.zuvio', '{"full_name":"Owner One"}'::jsonb);
select tests.create_user('seeker@test.zuvio', '{"full_name":"Seeker"}'::jsonb);
select tests.create_user('seeker2@test.zuvio', '{"full_name":"Seeker Two"}'::jsonb);
select tests.make_owner(tests.user_id('o1@test.zuvio'));
create temp table memo (k text primary key, v text);
grant all on memo to anon, authenticated, service_role;
create function pg_temp.m(p_k text) returns uuid language sql stable as 'select v::uuid from memo where k = p_k';
grant execute on function pg_temp.m(text) to anon, authenticated, service_role;
-- one line of the denormalised state of a property
create function pg_temp.d(p_k text) returns text language sql stable as $$
  select concat_ws(' | ', 'rent ' || coalesce(min_rent::text, '-') || '..' || coalesce(max_rent::text, '-'),
                   'beds ' || available_beds || '/' || total_beds, 'occ ' || occupancy_options::text,
                   'amen ' || amenity_codes::text, 'ac ' || has_ac, 'bath ' || has_attached_bathroom)
  from public.properties where id = (select v::uuid from memo where k = p_k) $$;
create function pg_temp.av(p_k text) returns text language sql stable as $$
  select status::text || coalesce(' from ' || available_from::text, '') from public.property_availability where property_id = (select v::uuid from memo where k = p_k) $$;

grant execute on function pg_temp.d(text) to anon, authenticated, service_role;
grant execute on function pg_temp.av(text) to anon, authenticated, service_role;

insert into memo select 'p', tests.create_property(tests.user_id('o1@test.zuvio'), 'Denorm PG')::text;
insert into memo select 'q', tests.create_property(tests.user_id('o1@test.zuvio'), 'Other PG')::text;
insert into memo select 'u', tests.create_property(tests.user_id('o1@test.zuvio'), 'Whole flat', 'entire_unit')::text;

-- ── starting state and the auto-created availability row ──
select is(pg_temp.d('p'), 'rent -..- | beds 0/0 | occ {} | amen {} | ac false | bath false', 'a new per_bed listing starts empty');
select is(pg_temp.av('p'), 'unavailable', 'per_bed without beds: availability row auto-created as unavailable');
select is(pg_temp.av('u'), 'available', 'entire_unit: availability row auto-created as available');
select is((select min_rent || '..' || max_rent from public.properties where id = pg_temp.m('u')), '25000..25000', 'entire_unit: min/max rent = monthly_rent');
update public.properties set monthly_rent = 27000 where id = pg_temp.m('u');
select is((select min_rent || '..' || max_rent from public.properties where id = pg_temp.m('u')), '27000..27000', 'entire_unit: rent change is mirrored');

-- ── rooms ──
with x as (insert into public.rooms (property_id, name, capacity, rent_per_bed, has_ac) values (pg_temp.m('p'), 'R1', 2, 9000, true) returning id)
  insert into memo select 'r1', id::text from x;
select is(pg_temp.d('p'), 'rent 9000..9000 | beds 0/0 | occ {2} | amen {} | ac true | bath false', 'a room without beds contributes rent, occupancy and AC');
with x as (insert into public.rooms (property_id, name, capacity, rent_per_bed, has_attached_bathroom) values (pg_temp.m('p'), 'R2', 4, 6000, true) returning id)
  insert into memo select 'r2', id::text from x;
select is(pg_temp.d('p'), 'rent 6000..9000 | beds 0/0 | occ {2,4} | amen {} | ac true | bath true', 'second room widens the range');

-- ── beds: capacity ──
insert into public.beds (room_id, label) values (pg_temp.m('r1'), 'A'), (pg_temp.m('r1'), 'B');
select throws_ok($$ insert into public.beds (room_id, label) values (pg_temp.m('r1'), 'C') $$, 'ZV422', 'This room already has all 2 of its beds.', 'a room cannot hold more beds than its capacity');
select throws_ok($$ insert into public.beds (room_id, label) values (pg_temp.m('r2'), '1'), (pg_temp.m('r2'), '2'), (pg_temp.m('r2'), '3'), (pg_temp.m('r2'), '4'), (pg_temp.m('r2'), '5') $$,
                 'ZV422', null, 'one multi-row insert cannot overfill a room either');
select throws_ok($$ update public.rooms set capacity = 1 where id = pg_temp.m('r1') $$, 'ZV422', null, 'capacity cannot drop below the number of beds');
select lives_ok($$ update public.rooms set capacity = 3 where id = pg_temp.m('r1') $$, 'capacity can be raised');
select lives_ok($$ insert into public.beds (room_id, label) values (pg_temp.m('r1'), 'C') $$, 'and then another bed fits');
update public.rooms set capacity = 4 where id = pg_temp.m('r1');
select throws_ok($$ insert into public.beds (room_id, label) values (pg_temp.m('r1'), 'C') $$, '23505', null, 'bed labels are unique within a room');
select throws_ok($$ insert into public.beds (room_id, label) values (gen_random_uuid(), 'X') $$, 'ZV404', null, 'a bed needs an existing room');

-- ── beds: property_id always matches the room ──
select is((select count(*)::int from public.beds where room_id = pg_temp.m('r1') and property_id = pg_temp.m('p')), 3, 'beds get their room''s property_id');
insert into public.beds (room_id, property_id, label) values (pg_temp.m('r1'), pg_temp.m('q'), 'D');
select is((select property_id from public.beds where label = 'D'), pg_temp.m('p'), 'a wrong property_id on insert is corrected to the room''s');
update public.beds set property_id = pg_temp.m('q') where label = 'D';
select is((select property_id from public.beds where label = 'D'), pg_temp.m('p'), 'a wrong property_id on update is corrected too');
select throws_ok($$ update public.rooms set property_id = pg_temp.m('q') where id = pg_temp.m('r1') $$, '23503', null, 'a room with beds cannot move to another property');
delete from public.beds where label = 'D';

-- ── denormalised bed fields + derived availability ──
select is(pg_temp.d('p'), 'rent 6000..9000 | beds 3/3 | occ {4} | amen {} | ac true | bath true', 'three available beds; the empty room still shows its rent');
select is(pg_temp.av('p'), 'available', 'derived: available');
update public.rooms set capacity = 2 where id = pg_temp.m('r2');
insert into public.beds (room_id, label, rent_override) values (pg_temp.m('r2'), '1', 5500);
select is(pg_temp.d('p'), 'rent 5500..9000 | beds 4/4 | occ {2,4} | amen {} | ac true | bath true', 'rent_override feeds min_rent; occupancy follows capacity changes');
update public.beds set status = 'occupied' where room_id = pg_temp.m('r1') and label in ('A', 'B');
select is(pg_temp.d('p'), 'rent 5500..9000 | beds 2/4 | occ {2,4} | amen {} | ac true | bath true', 'occupied beds leave available_beds, not total_beds');
select is(pg_temp.av('p'), 'available', 'derived: 2 of 4 is still available');
update public.beds set status = 'reserved' where room_id = pg_temp.m('r1') and label = 'C';
select is(pg_temp.av('p'), 'limited', 'derived: 1 of 4 (a quarter) is limited');
update public.beds set available_from = current_date + 20 where room_id = pg_temp.m('r2');
select is(pg_temp.av('p'), 'coming_soon from ' || (current_date + 20)::text, 'derived: the only available bed frees up later -> coming_soon with the date');
update public.beds set status = 'occupied' where room_id = pg_temp.m('r2');
select is(pg_temp.d('p'), 'rent 5500..9000 | beds 0/4 | occ {2,4} | amen {} | ac true | bath true', 'no bed available');
select is(pg_temp.av('p'), 'fully_occupied', 'derived: fully_occupied, date cleared');
update public.beds set status = 'blocked' where property_id = pg_temp.m('p');
select is(pg_temp.av('p'), 'unavailable', 'derived: every bed blocked -> unavailable');
update public.beds set status = 'available', available_from = null where property_id = pg_temp.m('p');
select is(pg_temp.av('p'), 'available', 'derived: back to available');
update public.rooms set rent_per_bed = 9500 where id = pg_temp.m('r1');
select is((select max_rent from public.properties where id = pg_temp.m('p')), 9500, 'a room rent change is mirrored');
-- soft-deleting / deleting rooms and beds
update public.rooms set deleted_at = now() where id = pg_temp.m('r1');
select is(pg_temp.d('p'), 'rent 5500..5500 | beds 1/1 | occ {2} | amen {} | ac false | bath true', 'a soft-deleted room and its beds leave every field');
update public.rooms set deleted_at = null where id = pg_temp.m('r1');
select is(pg_temp.d('p'), 'rent 5500..9500 | beds 4/4 | occ {2,4} | amen {} | ac true | bath true', 'restoring the room restores them');
delete from public.beds where room_id = pg_temp.m('r2');
select is(pg_temp.d('p'), 'rent 6000..9500 | beds 3/3 | occ {2,4} | amen {} | ac true | bath true', 'deleting a bed updates counts; the room falls back to its own rent');
delete from public.rooms where id = pg_temp.m('r2');
select is(pg_temp.d('p'), 'rent 9500..9500 | beds 3/3 | occ {4} | amen {} | ac true | bath false', 'deleting a room updates every field');
delete from public.rooms where id = pg_temp.m('r1');
select is(pg_temp.d('p'), 'rent -..- | beds 0/0 | occ {} | amen {} | ac false | bath false', 'deleting the last room (cascading to its beds) empties the fields');
select is(pg_temp.av('p'), 'unavailable', 'derived: no beds -> unavailable again');
select is(pg_temp.d('q'), 'rent -..- | beds 0/0 | occ {} | amen {} | ac false | bath false', 'another property was never touched');

-- ── listing_mode switch ──
with x as (insert into public.rooms (property_id, name, capacity, rent_per_bed) values (pg_temp.m('u'), 'Bedroom', 2, 4000) returning id)
  insert into public.beds (room_id, label) select id, 'A' from x;
select is((select min_rent || '..' || max_rent || ' beds ' || total_beds from public.properties where id = pg_temp.m('u')), '27000..27000 beds 1',
          'entire_unit: rooms and beds are counted but the rent is the unit''s');
select is(pg_temp.av('u'), 'available', 'entire_unit: availability is not derived from beds');
update public.beds set status = 'occupied' where property_id = pg_temp.m('u');
select is(pg_temp.av('u'), 'available', 'entire_unit: still the owner''s statement');
update public.properties set listing_mode = 'per_bed' where id = pg_temp.m('u');
select is((select min_rent || '..' || max_rent from public.properties where id = pg_temp.m('u')), '4000..4000', 'switching to per_bed recomputes rent from beds');
select is(pg_temp.av('u'), 'fully_occupied', 'and availability becomes derived');
update public.properties set listing_mode = 'entire_unit' where id = pg_temp.m('u');

-- ── availability: owner-set for entire_unit, derived (not settable) for per_bed ──
with x as (insert into public.rooms (property_id, name, capacity, rent_per_bed) values (pg_temp.m('p'), 'R3', 2, 8000) returning id)
  insert into public.beds (room_id, label) select id, 'A' from x;
select tests.act_as('o1@test.zuvio');
update public.property_availability set status = 'coming_soon', available_from = current_date + 10, notice_period_days = 30 where property_id = pg_temp.m('u');
select is(pg_temp.av('u'), 'coming_soon from ' || (current_date + 10)::text, 'entire_unit: the owner sets status and date');
update public.property_availability set status = 'fully_occupied', available_from = current_date + 99, min_stay_months = 6 where property_id = pg_temp.m('p');
select is(pg_temp.av('p'), 'available', 'per_bed: the owner''s status / date are discarded (derived from beds)');
select is((select min_stay_months from public.property_availability where property_id = pg_temp.m('p')), 6::smallint, 'per_bed: the owner still sets the stay terms');
select tests.act_as_service();
update public.property_availability set status = 'unavailable', confirmed_by = tests.user_id('o1@test.zuvio'), last_confirmed_at = now() where property_id = pg_temp.m('p');
select tests.act_as_owner();
select is(pg_temp.av('p'), 'available', 'per_bed: service_role cannot override the derived status either');
select is((select confirmed_by from public.property_availability where property_id = pg_temp.m('p')), null, 'confirmation stamps are not writable by API roles');

-- ── amenities ──
insert into public.property_amenities (property_id, amenity_code) values (pg_temp.m('p'), 'wifi'), (pg_temp.m('p'), 'ac'), (pg_temp.m('p'), 'attached_bathroom');
select is(pg_temp.d('p'), 'rent 8000..8000 | beds 1/1 | occ {2} | amen {ac,attached_bathroom,wifi} | ac true | bath true', 'amenity codes are mirrored (sorted); ac / attached_bathroom amenities set the flags');
delete from public.property_amenities where property_id = pg_temp.m('p') and amenity_code in ('ac', 'attached_bathroom');
select is(pg_temp.d('p'), 'rent 8000..8000 | beds 1/1 | occ {2} | amen {wifi} | ac false | bath false', 'removing amenities clears codes and flags');
update public.amenities set code = 'wi_fi' where code = 'wifi';
select is((select amenity_codes from public.properties where id = pg_temp.m('p')), array['wi_fi'], 'renaming an amenity code cascades into amenity_codes');

-- ── media: cover ──
select is((select cover_media_path from public.properties where id = pg_temp.m('p')), null, 'no media, no cover');
with x as (insert into public.property_media (property_id, storage_path, position) values (pg_temp.m('p'), pg_temp.m('p')::text || '/b.webp', 2) returning id) insert into memo select 'mb', id::text from x;
with x as (insert into public.property_media (property_id, storage_path, position) values (pg_temp.m('p'), pg_temp.m('p')::text || '/a.webp', 1) returning id) insert into memo select 'ma', id::text from x;
insert into public.property_media (property_id, storage_path, kind, position) values (pg_temp.m('p'), pg_temp.m('p')::text || '/tour.mp4', 'video', 0);
select is((select cover_media_path from public.properties where id = pg_temp.m('p')), pg_temp.m('p')::text || '/a.webp', 'without an explicit cover the first image by position is used (videos never)');
update public.property_media set is_cover = true where id = pg_temp.m('mb');
select is((select cover_media_path from public.properties where id = pg_temp.m('p')), pg_temp.m('p')::text || '/b.webp', 'an explicit cover wins');
update public.property_media set is_cover = true where id = pg_temp.m('ma');
select is((select count(*)::int from public.property_media where property_id = pg_temp.m('p') and is_cover), 1, 'choosing another cover leaves exactly one cover');
select is((select cover_media_path from public.properties where id = pg_temp.m('p')), pg_temp.m('p')::text || '/a.webp', 'and the property follows it');
insert into public.property_media (property_id, storage_path, is_cover) values (pg_temp.m('p'), pg_temp.m('p')::text || '/c.webp', true);
select is((select count(*)::int from public.property_media where property_id = pg_temp.m('p') and is_cover), 1, 'inserting a new cover also leaves exactly one');
select is((select cover_media_path from public.properties where id = pg_temp.m('p')), pg_temp.m('p')::text || '/c.webp', 'cover_media_path is the new cover');
delete from public.property_media where storage_path like '%/c.webp';
select is((select cover_media_path from public.properties where id = pg_temp.m('p')), pg_temp.m('p')::text || '/a.webp', 'deleting the cover falls back to the first image');
delete from public.property_media where property_id = pg_temp.m('p');
select is((select cover_media_path from public.properties where id = pg_temp.m('p')), null, 'deleting all media clears the cover');
-- a room photo survives its room
with x as (insert into public.rooms (property_id, name) values (pg_temp.m('q'), 'Photo room') returning id) insert into memo select 'qr', id::text from x;
insert into public.property_media (property_id, room_id, storage_path) values (pg_temp.m('q'), pg_temp.m('qr'), pg_temp.m('q')::text || '/room.webp');
delete from public.rooms where id = pg_temp.m('qr');
select is((select room_id from public.property_media where property_id = pg_temp.m('q')), null, 'deleting a room keeps its photo and clears room_id only');
select is((select property_id from public.property_media where storage_path like '%/room.webp'), pg_temp.m('q'), 'property_id is untouched');

-- ── row caps ──
insert into public.property_charges (property_id, label, amount) select pg_temp.m('q'), 'Charge ' || g, 100 from generate_series(1, 20) g;
select throws_ok($$ insert into public.property_charges (property_id, label, amount) values (pg_temp.m('q'), 'One too many', 1) $$, 'ZV422', null, 'at most 20 charges per property');
insert into public.property_media (property_id, storage_path) select pg_temp.m('q'), pg_temp.m('q')::text || '/' || g || '.webp' from generate_series(1, 39) g;
select throws_ok($$ insert into public.property_media (property_id, storage_path) values (pg_temp.m('q'), pg_temp.m('q')::text || '/over.webp') $$, 'ZV422', null, 'at most 40 media rows per property');

-- ── ratings ──
select tests.set_listing_status(pg_temp.m('p'), 'published');
with x as (insert into public.property_reviews (property_id, author_id, rating, body) values (pg_temp.m('p'), tests.user_id('seeker@test.zuvio'), 5, 'Clean rooms and good food.') returning id)
  insert into memo select 'rv1', id::text from x;
select is((select rating_avg::text || ' / ' || rating_count from public.properties where id = pg_temp.m('p')), '5.00 / 1', 'first review');
with x as (insert into public.property_reviews (property_id, author_id, rating) values (pg_temp.m('p'), tests.user_id('seeker2@test.zuvio'), 2) returning id)
  insert into memo select 'rv2', id::text from x;
select is((select rating_avg::text || ' / ' || rating_count from public.properties where id = pg_temp.m('p')), '3.50 / 2', 'average of two');
update public.property_reviews set rating = 4 where id = pg_temp.m('rv2');
select is((select rating_avg::text || ' / ' || rating_count from public.properties where id = pg_temp.m('p')), '4.50 / 2', 'an edited rating is mirrored');
update public.property_reviews set status = 'hidden' where id = pg_temp.m('rv1');
select is((select rating_avg::text || ' / ' || rating_count from public.properties where id = pg_temp.m('p')), '4.00 / 1', 'a hidden review stops counting');
update public.property_reviews set status = 'published', deleted_at = now() where id = pg_temp.m('rv1');
select is((select rating_avg::text || ' / ' || rating_count from public.properties where id = pg_temp.m('p')), '4.00 / 1', 'a soft-deleted review does not count');
update public.property_reviews set deleted_at = null where id = pg_temp.m('rv1');
delete from public.property_reviews where id = pg_temp.m('rv2');
select is((select rating_avg::text || ' / ' || rating_count from public.properties where id = pg_temp.m('p')), '5.00 / 1', 'a deleted review stops counting');
delete from public.property_reviews where property_id = pg_temp.m('p');
select is((select coalesce(rating_avg::text, 'null') || ' / ' || rating_count from public.properties where id = pg_temp.m('p')), 'null / 0', 'no reviews: NULL average, zero count');
select throws_ok($$ insert into public.property_reviews (property_id, author_id, rating) values (pg_temp.m('p'), tests.user_id('seeker@test.zuvio'), 6) $$, '23514', null, 'rating above 5 refused');
select throws_ok($$ insert into public.property_reviews (property_id, author_id, rating) values (pg_temp.m('p'), tests.user_id('seeker@test.zuvio'), 0) $$, '23514', null, 'rating below 1 refused');

-- ── the triggers also work when the OWNER (not the table owner) makes the change ──
select tests.act_as('o1@test.zuvio');
with x as (insert into public.rooms (property_id, name, capacity, rent_per_bed) values (pg_temp.m('q'), 'Owner room', 2, 7000) returning id)
  insert into memo select 'or', id::text from x;
insert into public.beds (room_id, label) values (pg_temp.m('or'), 'A'), (pg_temp.m('or'), 'B');
select throws_ok($$ insert into public.beds (room_id, label) values (pg_temp.m('or'), 'C') $$, 'ZV422', null, 'capacity is enforced for the owner');
insert into public.property_amenities (property_id, amenity_code) values (pg_temp.m('q'), 'gym');
update public.beds set status = 'occupied' where room_id = pg_temp.m('or') and label = 'A';
select is((select min_rent || '..' || max_rent || ' beds ' || available_beds || '/' || total_beds || ' ' || amenity_codes::text from public.properties where id = pg_temp.m('q')),
          '7000..7000 beds 1/2 {gym}', 'denormalised fields follow the owner''s own inserts and updates');
select is(pg_temp.av('q'), 'available', 'and so does the derived availability');

-- ── deleting a property cascades cleanly through every trigger ──
select tests.act_as_owner();
select lives_ok($$ delete from public.properties where id = pg_temp.m('q') $$, 'deleting a property with rooms, beds, media, charges and amenities works');
select is((select count(*)::int from public.beds where property_id = pg_temp.m('q')) + (select count(*)::int from public.rooms where property_id = pg_temp.m('q'))
          + (select count(*)::int from public.property_availability where property_id = pg_temp.m('q')), 0, 'its children are gone');

select * from finish();
rollback;
