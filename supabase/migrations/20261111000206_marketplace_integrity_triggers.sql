-- ZUVIO stage 2 / 06 — integrity triggers and the denormalised search fields of properties.
--
-- None of these functions is callable through the API (trigger functions and internal helpers:
-- EXECUTE is revoked and never granted). The ones marked SECURITY DEFINER must read or write rows
-- the acting user may not touch directly (e.g. a reviewer is not the owner of the property whose
-- rating changes); they make no authorisation decision — RLS already decided that the triggering
-- statement was allowed.

-- ───────────────────────────── beds: property_id + capacity ─────────────────────────────
-- 1. beds.property_id is always its room's property: copied from the room here, and guaranteed by
--    the composite foreign key beds_room_property_fkey whatever happens later.
-- 2. A room never holds more beds than rooms.capacity.
--    Concurrency: the room row is locked FOR NO KEY UPDATE before counting, so two simultaneous
--    inserts into the same room queue up and the second one counts the first one's bed. Lowering
--    rooms.capacity takes the same row lock (it is an UPDATE of that row), see rooms_capacity_guard.
create function public.beds_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property_id uuid;
  v_capacity    smallint;
  v_count       integer;
begin
  select r.property_id, r.capacity into v_property_id, v_capacity
  from public.rooms r
  where r.id = new.room_id
  for no key update;

  if not found then
    raise exception 'That room does not exist.' using errcode = 'ZV404';
  end if;
  new.property_id := v_property_id;

  if tg_op = 'INSERT' or new.room_id is distinct from old.room_id then
    select count(*) into v_count from public.beds b where b.room_id = new.room_id and b.id <> new.id;
    if v_count >= v_capacity then
      raise exception 'This room already has all % of its beds.', v_capacity using errcode = 'ZV422';
    end if;
  end if;
  return new;
end
$$;
revoke all on function public.beds_before_write() from public, anon, authenticated;

create trigger beds_before_write
  before insert or update of room_id, property_id on public.beds
  for each row execute function public.beds_before_write();

create function public.rooms_capacity_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if new.capacity < old.capacity then
    select count(*) into v_count from public.beds b where b.room_id = new.id;
    if v_count > new.capacity then
      raise exception 'This room has % beds. Remove beds before lowering its capacity to %.', v_count, new.capacity
        using errcode = 'ZV422';
    end if;
  end if;
  return new;
end
$$;
revoke all on function public.rooms_capacity_guard() from public, anon, authenticated;

create trigger rooms_capacity_guard
  before update of capacity on public.rooms
  for each row execute function public.rooms_capacity_guard();

-- ───────────────────────────── media: one cover per property ─────────────────────────────
-- Marking a row as cover clears the flag on the property's other rows first, so the partial unique
-- index property_media_one_cover_idx is never violated by a normal "make this the cover" update.
-- (Two simultaneous cover switches for one property: the second waits on the index and fails with
-- 23505 rather than leaving two covers.)
create function public.property_media_single_cover()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_cover then
    update public.property_media m
    set is_cover = false
    where m.property_id = new.property_id and m.is_cover and m.id <> new.id;
  end if;
  return new;
end
$$;
revoke all on function public.property_media_single_cover() from public, anon, authenticated;

create trigger property_media_single_cover
  before insert or update of is_cover on public.property_media
  for each row execute function public.property_media_single_cover();

-- ───────────────────────────── per-property row caps ─────────────────────────────
-- Stops one listing from accumulating unbounded child rows. TG_ARGV[0] = maximum rows per
-- property. A soft cap: it is not serialised, so two simultaneous inserts can overshoot by one.
create function public.enforce_property_child_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max   integer := tg_argv[0]::integer;
  v_count integer;
begin
  execute pg_catalog.format('select count(*) from %I.%I where property_id = $1', tg_table_schema, tg_table_name)
    into v_count using new.property_id;
  if v_count >= v_max then
    raise exception 'This listing has reached the limit of % entries here.', v_max using errcode = 'ZV422';
  end if;
  return new;
end
$$;
revoke all on function public.enforce_property_child_limit() from public, anon, authenticated;

create trigger rooms_limit before insert on public.rooms
  for each row execute function public.enforce_property_child_limit('200');
create trigger property_media_limit before insert on public.property_media
  for each row execute function public.enforce_property_child_limit('40');
create trigger property_rules_limit before insert on public.property_rules
  for each row execute function public.enforce_property_child_limit('40');
create trigger property_charges_limit before insert on public.property_charges
  for each row execute function public.enforce_property_child_limit('20');

-- ───────────────────────────── denormalised search fields ─────────────────────────────
-- Recomputes every denormalised column of ONE property from its rooms, beds, amenities, media and
-- reviews, and (per_bed listings) the derived property_availability row. Always a full recompute
-- from source rows, so it cannot drift.
--
-- Concurrency: the property row is locked first. Two transactions changing children of the same
-- property therefore run this one after the other, and because the aggregates below are separate
-- statements issued after the lock is held (READ COMMITTED), the later one sees the earlier one's
-- committed rows. The last writer always stores the complete picture.
create function public.refresh_property_search_fields(p_property_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mode        public.listing_mode;
  v_rent        integer;
  v_total       integer;
  v_avail       integer;
  v_avail_now   integer;
  v_blocked     integer;
  v_next_date   date;
  v_bed_min     integer;
  v_bed_max     integer;
  v_room_min    integer;
  v_room_max    integer;
  v_min         integer;
  v_max         integer;
  v_occupancy   smallint[];
  v_room_ac     boolean;
  v_room_bath   boolean;
  v_amenities   text[];
  v_cover       text;
  v_rating_avg  numeric(3,2);
  v_rating_cnt  integer;
  v_status      public.availability_status;
  v_from        date;
begin
  select p.listing_mode, p.monthly_rent into v_mode, v_rent
  from public.properties p
  where p.id = p_property_id
  for update;
  if not found then
    return;  -- the property is being deleted (cascade) or never existed
  end if;

  select count(*),
         count(*) filter (where b.status = 'available'),
         count(*) filter (where b.status = 'available' and (b.available_from is null or b.available_from <= current_date)),
         count(*) filter (where b.status = 'blocked'),
         min(b.available_from) filter (where b.status = 'available'),
         min(coalesce(b.rent_override, r.rent_per_bed)),
         max(coalesce(b.rent_override, r.rent_per_bed))
    into v_total, v_avail, v_avail_now, v_blocked, v_next_date, v_bed_min, v_bed_max
  from public.beds b
  join public.rooms r on r.id = b.room_id
  where b.property_id = p_property_id and r.deleted_at is null;

  select coalesce(array_agg(distinct r.capacity order by r.capacity), '{}'),
         coalesce(bool_or(r.has_ac), false),
         coalesce(bool_or(r.has_attached_bathroom), false),
         -- rooms that have no beds yet still contribute their advertised rent
         min(r.rent_per_bed) filter (where not exists (select 1 from public.beds b where b.room_id = r.id)),
         max(r.rent_per_bed) filter (where not exists (select 1 from public.beds b where b.room_id = r.id))
    into v_occupancy, v_room_ac, v_room_bath, v_room_min, v_room_max
  from public.rooms r
  where r.property_id = p_property_id and r.deleted_at is null;

  if v_mode = 'entire_unit' then
    v_min := v_rent;
    v_max := v_rent;
  else
    v_min := least(v_bed_min, v_room_min);       -- least/greatest ignore NULLs
    v_max := greatest(v_bed_max, v_room_max);
  end if;

  select coalesce(array_agg(a.amenity_code order by a.amenity_code), '{}') into v_amenities
  from public.property_amenities a
  where a.property_id = p_property_id;

  select m.storage_path into v_cover
  from public.property_media m
  where m.property_id = p_property_id and m.kind = 'image'
  order by m.is_cover desc, m.position, m.created_at, m.id
  limit 1;

  select round(avg(rv.rating), 2), count(*) into v_rating_avg, v_rating_cnt
  from public.property_reviews rv
  where rv.property_id = p_property_id and rv.status = 'published' and rv.deleted_at is null;

  update public.properties p
  set min_rent = v_min,
      max_rent = v_max,
      total_beds = v_total,
      available_beds = v_avail,
      occupancy_options = v_occupancy,
      amenity_codes = v_amenities,
      has_ac = v_room_ac or 'ac' = any (v_amenities),
      has_attached_bathroom = v_room_bath or 'attached_bathroom' = any (v_amenities),
      cover_media_path = v_cover,
      rating_avg = v_rating_avg,
      rating_count = v_rating_cnt
  where p.id = p_property_id
    and (p.min_rent, p.max_rent, p.total_beds, p.available_beds, p.occupancy_options, p.amenity_codes,
         p.has_ac, p.has_attached_bathroom, p.cover_media_path, p.rating_avg, p.rating_count)
        is distinct from
        (v_min, v_max, v_total, v_avail, v_occupancy, v_amenities,
         v_room_ac or 'ac' = any (v_amenities), v_room_bath or 'attached_bathroom' = any (v_amenities),
         v_cover, v_rating_avg, v_rating_cnt);

  -- per_bed listings: the property's availability statement follows the beds
  if v_mode = 'per_bed' then
    if v_total = 0 or v_blocked = v_total then
      v_status := 'unavailable';
    elsif v_avail = 0 then
      v_status := 'fully_occupied';
    elsif v_avail_now = 0 then
      v_status := 'coming_soon';
      v_from := v_next_date;
    elsif v_avail * 4 <= v_total then
      v_status := 'limited';
    else
      v_status := 'available';
    end if;

    update public.property_availability a
    set status = v_status, available_from = v_from
    where a.property_id = p_property_id
      and (a.status, a.available_from) is distinct from (v_status, v_from);
  end if;
end
$$;
revoke all on function public.refresh_property_search_fields(uuid) from public, anon, authenticated;
comment on function public.refresh_property_search_fields(uuid) is 'Internal (not API-callable): recomputes the denormalised search columns of one property (min_rent, max_rent, total_beds, available_beds, occupancy_options, amenity_codes, has_ac, has_attached_bathroom, cover_media_path, rating_avg, rating_count) and, for per_bed listings, the derived property_availability status. Called by triggers on every change to rooms, beds, amenities, media and reviews; safe to call again at any time (e.g. from a scheduled job).';

-- Statement-level trigger with transition tables: one recompute per affected property per
-- statement, however many rows the statement touched (bulk inserts stay cheap). Properties are
-- processed in id order so two statements touching the same properties lock them in the same
-- order. Works for every table that has a property_id column.
create function public.refresh_properties_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if tg_op = 'INSERT' then
    for v_id in select distinct n.property_id from new_rows n order by 1 loop
      perform public.refresh_property_search_fields(v_id);
    end loop;
  elsif tg_op = 'DELETE' then
    for v_id in select distinct o.property_id from old_rows o order by 1 loop
      perform public.refresh_property_search_fields(v_id);
    end loop;
  else
    for v_id in select n.property_id from new_rows n union select o.property_id from old_rows o order by 1 loop
      perform public.refresh_property_search_fields(v_id);
    end loop;
  end if;
  return null;
end
$$;
revoke all on function public.refresh_properties_after_change() from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['rooms', 'beds', 'property_amenities', 'property_media', 'property_reviews'] loop
    execute pg_catalog.format(
      'create trigger %I after insert on public.%I referencing new table as new_rows
         for each statement execute function public.refresh_properties_after_change()',
      v_table || '_refresh_property_ins', v_table);
    execute pg_catalog.format(
      'create trigger %I after update on public.%I referencing old table as old_rows new table as new_rows
         for each statement execute function public.refresh_properties_after_change()',
      v_table || '_refresh_property_upd', v_table);
    execute pg_catalog.format(
      'create trigger %I after delete on public.%I referencing old table as old_rows
         for each statement execute function public.refresh_properties_after_change()',
      v_table || '_refresh_property_del', v_table);
  end loop;
end
$$;

-- A new property gets its availability row at once (entire_unit: "available" until the owner says
-- otherwise; per_bed: derived, "unavailable" while there are no beds) and its first recompute.
-- Changing listing_mode or monthly_rent later changes min_rent / max_rent and what availability means.
create function public.properties_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.property_availability (property_id, status)
    values (new.id, case when new.listing_mode = 'entire_unit' then 'available' else 'unavailable' end::public.availability_status)
    on conflict (property_id) do nothing;
  end if;
  perform public.refresh_property_search_fields(new.id);
  return null;
end
$$;
revoke all on function public.properties_after_write() from public, anon, authenticated;

create trigger properties_after_insert
  after insert on public.properties
  for each row execute function public.properties_after_write();

-- Column-list trigger: the recompute's own UPDATE never names these columns, so no recursion.
create trigger properties_after_mode_or_rent_change
  after update of listing_mode, monthly_rent on public.properties
  for each row
  when (old.listing_mode is distinct from new.listing_mode or old.monthly_rent is distinct from new.monthly_rent)
  execute function public.properties_after_write();

-- ───────────────────────────── availability: derived for per_bed ─────────────────────────────
-- For per_bed listings status / available_from belong to the beds: an API caller's values are
-- discarded and the stored ones kept. Trusted code (the recompute above, running as the table
-- owner) writes them. confirmed_by / last_confirmed_at are never client-writable (no grant).
-- SECURITY INVOKER on purpose: it must see the real current_user.
create function public.property_availability_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_trusted boolean;
  v_mode    public.listing_mode;
begin
  select pg_catalog.pg_has_role(current_user, c.relowner, 'MEMBER') into v_trusted
  from pg_catalog.pg_class c where c.oid = tg_relid;
  if coalesce(v_trusted, false) then
    return new;
  end if;

  select p.listing_mode into v_mode from public.properties p where p.id = new.property_id;
  if v_mode is distinct from 'entire_unit' then
    new.status := old.status;
    new.available_from := old.available_from;
  end if;
  new.last_confirmed_at := old.last_confirmed_at;
  new.confirmed_by := old.confirmed_by;
  return new;
end
$$;
revoke all on function public.property_availability_guard() from public, anon, authenticated;

create trigger property_availability_guard
  before update on public.property_availability
  for each row execute function public.property_availability_guard();

-- ───────────────────────────── verification_records: subject must exist ─────────────────────────────
-- subject_id is polymorphic (no foreign key), so existence is checked here; RLS separately checks
-- that an API caller owns the subject. Records about a property are removed with the property.
create function public.verification_records_check_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.subject_type = 'owner' then
    if not exists (select 1 from public.property_owners o where o.user_id = new.subject_id) then
      raise exception 'Register as an owner before submitting documents.' using errcode = 'ZV422';
    end if;
  elsif not exists (select 1 from public.properties p where p.id = new.subject_id and p.owner_id = new.submitted_by) then
    raise exception 'That property does not exist or is not yours.' using errcode = 'ZV404';
  end if;
  return new;
end
$$;
revoke all on function public.verification_records_check_subject() from public, anon, authenticated;

create trigger verification_records_check_subject
  before insert or update of subject_type, subject_id, submitted_by on public.verification_records
  for each row execute function public.verification_records_check_subject();

create function public.properties_delete_verification_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.verification_records v where v.subject_type = 'property' and v.subject_id = old.id;
  return null;
end
$$;
revoke all on function public.properties_delete_verification_records() from public, anon, authenticated;

create trigger properties_delete_verification_records
  after delete on public.properties
  for each row execute function public.properties_delete_verification_records();
