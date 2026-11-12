-- Stage 2: marketplace enums, reference data, constraints, slug, search vector, privileges.
begin;
select * from no_plan();

-- ── enums ──
select enum_has_labels('public', 'property_type', array['pg','boys_pg','girls_pg','hostel','co_living','private_room','shared_room','studio','one_bhk','two_bhk','three_bhk','independent_house']);
select enum_has_labels('public', 'listing_mode', array['per_bed','entire_unit']);
select enum_has_labels('public', 'tenant_gender', array['any','male','female']);
select enum_has_labels('public', 'furnishing', array['unfurnished','semi_furnished','fully_furnished']);
select enum_has_labels('public', 'listing_status', array['draft','pending_review','published','paused','rejected','archived']);
select enum_has_labels('public', 'availability_status', array['available','limited','fully_occupied','coming_soon','unavailable']);
select enum_has_labels('public', 'bed_status', array['available','reserved','occupied','blocked']);
select enum_has_labels('public', 'room_type', array['private','shared']);
select enum_has_labels('public', 'utility_billing', array['included','fixed','metered']);
select enum_has_labels('public', 'inquiry_status', array['new','responded','closed','spam']);
select enum_has_labels('public', 'owner_type', array['individual','pg_operator','agent','company']);
select enum_has_labels('public', 'charge_frequency', array['monthly','one_time','yearly']);
select enum_has_labels('public', 'media_kind', array['image','video']);
select enum_has_labels('public', 'review_status', array['published','hidden','removed']);
select enum_has_labels('public', 'property_verification_kind', array['authorisation','listing_confirmation','site_visit']);
select enum_has_labels('public', 'verification_kind', array['government_id','ownership_proof','authorisation_letter','utility_bill','business_registration']);
select enum_has_labels('public', 'place_kind', array['college','university','office','tech_park','metro_station','railway_station','airport','bus_stop','hospital','pharmacy','restaurant','cafe','grocery','shopping_centre','gym']);

-- ── every table of the stage exists, with RLS on and not forced ──
select is(
  (select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and c.relrowsecurity and not c.relforcerowsecurity
     and c.relname in ('cities','property_owners','properties','rooms','beds','amenities','property_amenities','property_media',
                       'property_rules','property_charges','property_availability','saved_properties','property_inquiries',
                       'contact_reveals','property_verifications','verification_records','property_stats_daily','places',
                       'property_nearby_places','property_reviews','owner_replies')),
  21, 'all 21 marketplace tables exist with RLS enabled (not forced)');
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)),
  'rate_limits', 'rate_limits is the only table without policies');
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and obj_description(c.oid, 'pg_class') is null),
  '', 'every table has a comment');

-- ── reference data ──
select is((select count(*)::int from public.cities), 15, '15 cities');
select is((select round(extensions.st_y(location::extensions.geometry)::numeric, 4) || ',' || round(extensions.st_x(location::extensions.geometry)::numeric, 4)
           from public.cities where slug = 'bengaluru'), '12.9716,77.5946', 'Bengaluru has the given coordinates (lat,lng)');
select is((select round(extensions.st_y(location::extensions.geometry)::numeric, 4) || ',' || round(extensions.st_x(location::extensions.geometry)::numeric, 4)
           from public.cities where slug = 'sonipat'), '28.9931,77.0151', 'Sonipat has the given coordinates');
select is((select state from public.cities where name = 'Kota'), 'Rajasthan', 'Kota is in Rajasthan');
select is((select count(*)::int from public.cities
           where extensions.st_y(location::extensions.geometry) between 6 and 38 and extensions.st_x(location::extensions.geometry) between 68 and 98), 15,
          'every city pin is inside India (lat/lng not swapped)');
select is((select count(*)::int from public.amenities), 24, '24 amenities');
select is((select count(*)::int from public.amenities where code in ('wifi','ac','food','laundry','parking','power_backup','housekeeping','cctv',
            'security_guard','lift','geyser','fridge','washing_machine','tv','kitchen','water_purifier','study_table','wardrobe',
            'attached_bathroom','balcony','gym','common_area','two_wheeler_parking','hot_water')), 24, 'the amenity codes from the brief');
select is((select count(distinct position)::int from public.amenities), 24, 'amenity positions are distinct');

-- ── user_preferences.property_types is now an enum array ──
select col_type_is('public', 'user_preferences', 'property_types', 'property_type[]', 'user_preferences.property_types is property_type[]');
select tests.create_user('o1@test.zuvio', '{"full_name":"Owner One"}'::jsonb);
select tests.create_user('o2@test.zuvio', '{"full_name":"Owner Two"}'::jsonb);
select tests.make_owner(tests.user_id('o1@test.zuvio'));
select tests.make_owner(tests.user_id('o2@test.zuvio'));
select tests.act_as('o1@test.zuvio');
select lives_ok($$ update public.user_preferences set property_types = array['pg','one_bhk']::public.property_type[] where user_id = (select auth.uid()) $$,
                'a user stores real property types in their preferences');
select throws_ok($$ update public.user_preferences set property_types = '{castle}' where user_id = (select auth.uid()) $$, '22P02', null,
                 'an unknown property type is refused');
select tests.act_as_owner();

-- ── constraints on properties ──
create temp table memo (k text primary key, v text);
grant all on memo to anon, authenticated, service_role;
insert into memo select 'p1', tests.create_property(tests.user_id('o1@test.zuvio'), 'Sunny PG for Students')::text;
insert into memo select 'p2', tests.create_property(tests.user_id('o2@test.zuvio'), 'Sunny PG for Students')::text;

select throws_ok($$ update public.properties set pincode = '056003' where id = (select v::uuid from memo where k = 'p1') $$, '23514', null, 'pincode cannot start with 0');
select throws_ok($$ update public.properties set pincode = '5600' where id = (select v::uuid from memo where k = 'p1') $$, '23514', null, 'pincode must have six digits');
select lives_ok($$ update public.properties set pincode = '560095' where id = (select v::uuid from memo where k = 'p1') $$, 'a valid pincode is accepted');
select throws_ok($$ update public.properties set monthly_rent = -1 where id = (select v::uuid from memo where k = 'p1') $$, '23514', null, 'rent cannot be negative');
select throws_ok($$ update public.properties set security_deposit = -5 where id = (select v::uuid from memo where k = 'p1') $$, '23514', null, 'deposit cannot be negative');
select throws_ok($$ update public.properties set title = 'ab' where id = (select v::uuid from memo where k = 'p1') $$, '23514', null, 'title needs 3+ characters');
select throws_ok($$ update public.properties set description = repeat('x', 4001) where id = (select v::uuid from memo where k = 'p1') $$, '23514', null, 'description is capped');
select throws_ok($$ update public.properties set food_included = true where id = (select v::uuid from memo where k = 'p1') $$, '23514', null, 'food cannot be included when it is not available');
select throws_ok($$ update public.properties set location = extensions.st_setsrid(extensions.st_makepoint(12.93, 77.62), 4326)::extensions.geography
                    where id = (select v::uuid from memo where k = 'p1') $$, '23514', null, 'a pin with swapped lat/lng is refused');
select throws_ok($$ insert into public.properties (owner_id, title, property_type, listing_mode) values (gen_random_uuid(), 'No such owner', 'pg', 'per_bed') $$,
                 '23503', null, 'a listing needs a registered owner');

-- rooms / beds / charges / reviews value constraints
with x as (insert into public.rooms (property_id, name, capacity, rent_per_bed)
  values ((select v::uuid from memo where k = 'p1'), 'Room 101', 2, 9000) returning id)
insert into memo select 'r1', id::text from x;
select throws_ok($$ insert into public.rooms (property_id, name, capacity) values ((select v::uuid from memo where k = 'p1'), 'Too big', 13) $$, '23514', null, 'room capacity is at most 12');
select throws_ok($$ insert into public.rooms (property_id, name, capacity) values ((select v::uuid from memo where k = 'p1'), 'Empty', 0) $$, '23514', null, 'room capacity is at least 1');
select throws_ok($$ insert into public.rooms (property_id, name, rent_per_bed) values ((select v::uuid from memo where k = 'p1'), 'Neg', -1) $$, '23514', null, 'room rent cannot be negative');
select throws_ok($$ insert into public.beds (room_id, label, rent_override) values ((select v::uuid from memo where k = 'r1'), 'A', -10) $$, '23514', null, 'bed rent cannot be negative');
select throws_ok($$ insert into public.property_charges (property_id, label, amount) values ((select v::uuid from memo where k = 'p1'), 'Laundry', -1) $$, '23514', null, 'charge amount cannot be negative');
select throws_ok($$ insert into public.property_media (property_id, storage_path) values ((select v::uuid from memo where k = 'p1'), (select v from memo where k = 'p2') || '/a.webp') $$,
                 '23514', null, 'a media path must be inside the property''s own folder');
select throws_ok($$ insert into public.property_media (property_id, storage_path) values ((select v::uuid from memo where k = 'p1'), (select v from memo where k = 'p1') || '/../x.webp') $$,
                 '23514', null, 'a media path cannot traverse');
select throws_ok($$ insert into public.property_media (property_id, storage_path, kind, is_cover) values ((select v::uuid from memo where k = 'p1'), (select v from memo where k = 'p1') || '/v.mp4', 'video', true) $$,
                 '23514', null, 'a video cannot be the cover');
select throws_ok($$ insert into public.property_amenities (property_id, amenity_code) values ((select v::uuid from memo where k = 'p1'), 'jacuzzi') $$, '23503', null, 'unknown amenity codes are refused');
select throws_ok($$ insert into public.property_owners (user_id, contact_phone) values (gen_random_uuid(), '12345') $$, '23514', null, 'owner phone format is checked');
select throws_ok($$ update public.property_owners set verification_status = 'verified' where user_id = tests.user_id('o1@test.zuvio') $$, '23514', null, 'verified needs verified_at');

-- a room / bed reference on another table must belong to the same property
select throws_ok($$ insert into public.property_media (property_id, room_id, storage_path) values ((select v::uuid from memo where k = 'p2'), (select v::uuid from memo where k = 'r1'), (select v from memo where k = 'p2') || '/r.webp') $$,
                 '23503', null, 'a photo cannot point at a room of another property');

-- ── slug ──
select matches((select slug from public.properties where id = (select v::uuid from memo where k = 'p1')),
               '^sunny-pg-for-students-koramangala-[0-9a-f]{8}$', 'slug = title + locality + 8 hex of the id');
select is((select right(slug, 8) from public.properties where id = (select v::uuid from memo where k = 'p1')),
          (select left(v, 8) from memo where k = 'p1'), 'the short id is the start of the property id');
select isnt((select slug from public.properties where id = (select v::uuid from memo where k = 'p1')),
            (select slug from public.properties where id = (select v::uuid from memo where k = 'p2')), 'same title and locality still give different slugs');
update public.properties set title = 'Café Résidence — Indiranagar!', locality = 'HSR Layout' where id = (select v::uuid from memo where k = 'p1');
select matches((select slug from public.properties where id = (select v::uuid from memo where k = 'p1')),
               '^cafe-residence-indiranagar-hsr-layout-[0-9a-f]{8}$', 'a draft''s slug follows its title; accents and punctuation are cleaned');
update public.properties set slug = 'hacked' where id = (select v::uuid from memo where k = 'p1');
select matches((select slug from public.properties where id = (select v::uuid from memo where k = 'p1')), '^cafe-residence-', 'a supplied slug is ignored');
with x as (insert into public.properties (owner_id, title, property_type, listing_mode, slug)
  values (tests.user_id('o1@test.zuvio'), 'शांति निवास', 'pg', 'per_bed', 'my-own-slug') returning slug)
insert into memo select 'slug3', slug from x;
select matches((select v from memo where k = 'slug3'), '^listing-[0-9a-f]{8}$', 'a title without Latin letters falls back to "listing-<id>"');
-- frozen once the listing has been public
insert into public.rooms (property_id, name, capacity, rent_per_bed) values ((select v::uuid from memo where k = 'p2'), 'R', 1, 8000);
select tests.set_listing_status((select v::uuid from memo where k = 'p2'), 'published');
insert into memo select 'slug2', slug from public.properties where id = (select v::uuid from memo where k = 'p2');
set local zuvio.listing_actor = 'system';
update public.properties set title = 'Completely New Name' where id = (select v::uuid from memo where k = 'p2');
set local zuvio.listing_actor = '';
select is((select slug from public.properties where id = (select v::uuid from memo where k = 'p2')), (select v from memo where k = 'slug2'),
          'the slug of a published listing does not change with its title');

-- ── search vector ──
select ok((select search_tsv @@ websearch_to_tsquery('english', 'residence') from public.properties where id = (select v::uuid from memo where k = 'p1')), 'search_tsv matches a title word (accent-insensitive)');
select ok((select search_tsv @@ websearch_to_tsquery('english', 'hsr layout') from public.properties where id = (select v::uuid from memo where k = 'p1')), 'search_tsv matches the locality');
select ok((select search_tsv @@ websearch_to_tsquery('english', 'bengaluru pg') from public.properties where id = (select v::uuid from memo where k = 'p1')), 'search_tsv matches city and property type');
select ok((select search_tsv @@ websearch_to_tsquery('english', '560095') from public.properties where id = (select v::uuid from memo where k = 'p1')), 'search_tsv matches the pincode');
select ok(not (select search_tsv @@ websearch_to_tsquery('english', 'mumbai') from public.properties where id = (select v::uuid from memo where k = 'p1')), 'search_tsv does not match another city');
update public.properties set description = 'Walking distance from the metro station' where id = (select v::uuid from memo where k = 'p1');
select ok((select search_tsv @@ websearch_to_tsquery('english', 'metro stations') from public.properties where id = (select v::uuid from memo where k = 'p1')), 'search_tsv follows description edits (stemmed)');

-- ── indexes the search stage relies on ──
select is((select count(*)::int from pg_indexes where schemaname = 'public' and tablename = 'properties'
           and indexname in ('properties_location_idx','properties_search_tsv_idx','properties_amenity_codes_idx','properties_locality_trgm_idx',
                             'properties_city_trgm_idx','properties_published_city_rent_idx','properties_published_type_idx',
                             'properties_published_min_rent_idx','properties_published_available_beds_idx')), 9, 'search indexes exist');
select matches((select indexdef from pg_indexes where indexname = 'properties_location_idx'), 'USING gist', 'location index is GiST');
select matches((select indexdef from pg_indexes where indexname = 'properties_search_tsv_idx'), 'USING gin', 'search_tsv index is GIN');
select matches((select indexdef from pg_indexes where indexname = 'properties_locality_trgm_idx'), 'gin_trgm_ops', 'locality index is trigram');
select matches((select indexdef from pg_indexes where indexname = 'properties_published_city_rent_idx'), $re$WHERE \(\(status = 'published'::(public\.)?listing_status\) AND \(deleted_at IS NULL\)\)$re$, 'published indexes are partial');
-- every foreign key column is the leading column of some index
select is(
  (select coalesce(string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ' order by 1), '')
   from pg_constraint c
   where c.contype = 'f' and c.connamespace = 'public'::regnamespace
     and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])),
  '', 'every foreign key in public has a supporting index');

-- ── privileges: internal functions are not API-callable; protected columns have no grant ──
select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by 1), '')
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('beds_before_write','rooms_capacity_guard','property_media_single_cover','enforce_property_child_limit',
                       'refresh_property_search_fields','refresh_properties_after_change','properties_after_write',
                       'property_availability_guard','verification_records_check_subject','properties_delete_verification_records',
                       'properties_lifecycle','slugify','properties_set_slug','properties_search_tsv')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute'))),
  '', 'stage-2 trigger functions and helpers are executable by no API role');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('beds_before_write','rooms_capacity_guard','property_media_single_cover','enforce_property_child_limit',
                       'refresh_property_search_fields','refresh_properties_after_change','properties_after_write',
                       'property_availability_guard','verification_records_check_subject','properties_delete_verification_records',
                       'properties_lifecycle','slugify','properties_set_slug','properties_search_tsv')), 14, 'all 14 stage-2 functions exist');
select is(
  (select coalesce(string_agg(a.attname, ', ' order by a.attname), '')
   from pg_attribute a
   where a.attrelid = 'public.properties'::regclass and a.attnum > 0 and not a.attisdropped
     and a.attname in ('status','slug','owner_id','rejection_reason','submitted_at','approved_at','published_at','last_confirmed_at',
                       'min_rent','max_rent','total_beds','available_beds','occupancy_options','amenity_codes','has_ac',
                       'has_attached_bathroom','cover_media_path','rating_avg','rating_count','search_tsv','deleted_at')
     and has_column_privilege('authenticated', 'public.properties', a.attname, 'update')),
  '', 'authenticated has no UPDATE grant on lifecycle, slug, owner or denormalised columns of properties');
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and c.relname in ('cities','property_owners','properties','rooms','beds','amenities','property_amenities','property_media',
                       'property_rules','property_charges','property_availability','saved_properties','property_inquiries',
                       'contact_reveals','property_verifications','verification_records','property_stats_daily','places',
                       'property_nearby_places','property_reviews','owner_replies')
     and (has_any_column_privilege('anon', c.oid, 'insert') or has_any_column_privilege('anon', c.oid, 'update')
          or has_table_privilege('anon', c.oid, 'delete') or has_table_privilege('anon', c.oid, 'truncate'))),
  '', 'anon has no write privilege on any marketplace table');
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and c.relname in ('property_owners','saved_properties','property_inquiries','contact_reveals','verification_records','property_stats_daily')
     and has_any_column_privilege('anon', c.oid, 'select')),
  '', 'anon cannot read the private marketplace tables at all');
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and c.relname in ('cities','amenities','places','property_nearby_places','property_inquiries','contact_reveals',
                       'property_verifications','property_stats_daily')
     and (has_any_column_privilege('authenticated', c.oid, 'insert') or has_any_column_privilege('authenticated', c.oid, 'update')
          or has_table_privilege('authenticated', c.oid, 'delete'))),
  '', 'authenticated has no write privilege on reference, server-written and function-written tables');

select * from finish();
rollback;
