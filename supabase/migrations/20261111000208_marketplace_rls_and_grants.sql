-- ZUVIO stage 2 / 08 — marketplace row level security, grants and the owner card view.
--
-- Model (stage 1, file 00): nothing is reachable until granted here. The GRANT says which commands
-- and COLUMNS an API role may use, the policies say on which rows. service_role keeps full table
-- access (it bypasses RLS) and is the only writer of places / property_nearby_places.
--
-- Visibility rule used throughout: a child row (room, bed, photo, rule, charge, availability,
-- verification, nearby place, review, reply) is visible exactly when its parent is visible to the
-- caller. The policies say so literally — "exists (select 1 from public.properties p where
-- p.id = property_id)" — and that sub-select runs under the caller's own RLS on properties:
--   anon           -> published and not soft-deleted
--   authenticated  -> published and not soft-deleted, OR own listing (any status), OR staff
-- so the rule is written once (on properties) and cannot drift between tables.
--
-- Write rule for owners: the row's property must be theirs, the account must be usable
-- (is_active_user: not suspended / deleted) and must not carry a "listing" restriction.
-- Columns owners may not write (status, lifecycle stamps, slug, denormalised fields, verification
-- fields) simply have no INSERT/UPDATE grant, so no policy can ever let a client change them.

-- ───────────────────────────── cities / amenities (reference data) ─────────────────────────────
grant select on public.cities to anon, authenticated;
grant select on public.amenities to anon, authenticated;

create policy cities_select_anon on public.cities for select to anon using (true);
create policy cities_select_authenticated on public.cities for select to authenticated using (true);
create policy amenities_select_anon on public.amenities for select to anon using (true);
create policy amenities_select_authenticated on public.amenities for select to authenticated using (true);

-- ───────────────────────────── property_owners ─────────────────────────────
-- Private: self + staff. Created by become_owner() (no INSERT grant). The owner edits only their
-- business / contact fields; verification fields have no grant.
grant select on public.property_owners to authenticated;
grant update (owner_type, business_name, contact_phone, contact_email, whatsapp_number, about)
  on public.property_owners to authenticated;

create policy property_owners_select_self_or_staff on public.property_owners
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

create policy property_owners_update_self on public.property_owners
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()));

-- ───────────────────────────── properties ─────────────────────────────
grant select on public.properties to anon, authenticated;
grant insert (owner_id, title, description, property_type, listing_mode, tenant_gender, furnishing,
              address_line, locality, city, state, pincode, landmark, location,
              monthly_rent, security_deposit, maintenance_monthly,
              electricity_billing, electricity_monthly_estimate, water_billing, water_monthly_estimate,
              food_available, food_included, food_monthly_charge, meals_breakfast, meals_lunch, meals_dinner)
  on public.properties to authenticated;
grant update (title, description, property_type, listing_mode, tenant_gender, furnishing,
              address_line, locality, city, state, pincode, landmark, location,
              monthly_rent, security_deposit, maintenance_monthly,
              electricity_billing, electricity_monthly_estimate, water_billing, water_monthly_estimate,
              food_available, food_included, food_monthly_charge, meals_breakfast, meals_lunch, meals_dinner)
  on public.properties to authenticated;
grant delete on public.properties to authenticated;

create policy properties_select_anon on public.properties
  for select to anon
  using (status = 'published' and deleted_at is null);

create policy properties_select_authenticated on public.properties
  for select to authenticated
  using ((status = 'published' and deleted_at is null)
         or owner_id = (select auth.uid())
         or (select public.is_staff()));

-- Only a registered owner (property_owners row via the foreign key + the owner role) creates
-- listings, always for themselves; the lifecycle trigger forces status = draft.
create policy properties_insert_owner on public.properties
  for insert to authenticated
  with check (owner_id = (select auth.uid())
              and (select public.has_role('owner'::public.user_role))
              and not (select public.has_active_restriction('listing'::public.restriction_kind)));

create policy properties_update_owner on public.properties
  for update to authenticated
  using (owner_id = (select auth.uid())
         and deleted_at is null
         and (select public.is_active_user())
         and not (select public.has_active_restriction('listing'::public.restriction_kind)))
  with check (owner_id = (select auth.uid()));

-- Hard delete only for a draft (never public, so nothing references it); anything else is archived.
create policy properties_delete_owner_draft on public.properties
  for delete to authenticated
  using (owner_id = (select auth.uid())
         and status = 'draft'
         and (select public.is_active_user()));

-- ───────────────────────────── rooms ─────────────────────────────
grant select on public.rooms to anon, authenticated;
grant insert (property_id, name, room_type, capacity, rent_per_bed, security_deposit, has_attached_bathroom,
              has_ac, has_balcony, floor, area_sqft, description, position)
  on public.rooms to authenticated;
grant update (name, room_type, capacity, rent_per_bed, security_deposit, has_attached_bathroom,
              has_ac, has_balcony, floor, area_sqft, description, position, deleted_at)
  on public.rooms to authenticated;
grant delete on public.rooms to authenticated;

create policy rooms_select_anon on public.rooms
  for select to anon
  using (deleted_at is null and exists (select 1 from public.properties p where p.id = rooms.property_id));

-- soft-deleted rooms stay visible to the listing's owner and to staff only
create policy rooms_select_authenticated on public.rooms
  for select to authenticated
  using (exists (select 1 from public.properties p
                 where p.id = rooms.property_id
                   and (rooms.deleted_at is null
                        or p.owner_id = (select auth.uid())
                        or (select public.is_staff()))));

-- ───────────────────────────── beds ─────────────────────────────
-- property_id is filled in from the room by trigger BEFORE the insert policy is checked, so a bed
-- aimed at someone else's room ends up with their property_id and is refused.
grant select on public.beds to anon, authenticated;
grant insert (room_id, property_id, label, status, available_from, rent_override) on public.beds to authenticated;
grant update (label, status, available_from, rent_override) on public.beds to authenticated;
grant delete on public.beds to authenticated;

-- a bed is visible when its room is (which hides beds of soft-deleted rooms from the public)
create policy beds_select_anon on public.beds
  for select to anon
  using (exists (select 1 from public.rooms r where r.id = beds.room_id));
create policy beds_select_authenticated on public.beds
  for select to authenticated
  using (exists (select 1 from public.rooms r where r.id = beds.room_id));

-- ───────────────────────────── other children of a property ─────────────────────────────
grant select on public.property_amenities to anon, authenticated;
grant insert (property_id, amenity_code) on public.property_amenities to authenticated;
grant delete on public.property_amenities to authenticated;

grant select on public.property_media to anon, authenticated;
grant insert (property_id, room_id, storage_path, kind, alt_text, width, height, size_bytes, position, is_cover)
  on public.property_media to authenticated;
grant update (room_id, alt_text, position, is_cover) on public.property_media to authenticated;
grant delete on public.property_media to authenticated;

grant select on public.property_rules to anon, authenticated;
grant insert (property_id, rule_code, allowed, value, note) on public.property_rules to authenticated;
grant update (allowed, value, note) on public.property_rules to authenticated;
grant delete on public.property_rules to authenticated;

grant select on public.property_charges to anon, authenticated;
grant insert (property_id, label, amount, frequency, is_mandatory, position) on public.property_charges to authenticated;
grant update (label, amount, frequency, is_mandatory, position) on public.property_charges to authenticated;
grant delete on public.property_charges to authenticated;

-- availability: the row is created by trigger; the owner updates it (for per_bed listings the
-- guard trigger keeps status / available_from derived from the beds)
grant select on public.property_availability to anon, authenticated;
grant update (status, available_from, min_stay_months, notice_period_days) on public.property_availability to authenticated;

-- read-only for clients: written by confirm_listing() / admin functions / the trusted server
grant select on public.property_verifications to anon, authenticated;
grant select on public.property_nearby_places to anon, authenticated;

-- One identical set of policies per table, generated so the rule cannot differ between them.
-- Names: <table>_select_anon, <table>_select_authenticated, <table>_insert_owner,
--        <table>_update_owner, <table>_delete_owner.
do $$
declare
  v_spec    text[];
  v_table   text;
  v_visible constant text := 'exists (select 1 from public.properties p where p.id = %1$I.property_id)';
  v_owned   constant text :=
    'exists (select 1 from public.properties p where p.id = %1$I.property_id and p.owner_id = (select auth.uid()))';
  v_usable  constant text :=
    ' and (select public.is_active_user()) and not (select public.has_active_restriction(''listing''::public.restriction_kind))';
begin
  foreach v_spec slice 1 in array array[
    -- table,                    commands owners may use
    ['rooms',                    'iud'],
    ['beds',                     'iud'],
    ['property_amenities',       'id'],
    ['property_media',           'iud'],
    ['property_rules',           'iud'],
    ['property_charges',         'iud'],
    ['property_availability',    'u'],
    ['property_verifications',   ''],
    ['property_nearby_places',   '']
  ] loop
    v_table := v_spec[1];

    if v_table not in ('rooms', 'beds') then   -- these two have their own select policies above
      execute pg_catalog.format('create policy %2$I on public.%1$I for select to anon using (' || v_visible || ')',
                                v_table, v_table || '_select_anon');
      execute pg_catalog.format('create policy %2$I on public.%1$I for select to authenticated using (' || v_visible || ')',
                                v_table, v_table || '_select_authenticated');
    end if;
    if v_spec[2] like '%i%' then
      execute pg_catalog.format('create policy %2$I on public.%1$I for insert to authenticated with check (' || v_owned || v_usable || ')',
                                v_table, v_table || '_insert_owner');
    end if;
    if v_spec[2] like '%u%' then
      execute pg_catalog.format('create policy %2$I on public.%1$I for update to authenticated using (' || v_owned || v_usable
                                || ') with check (' || v_owned || ')',
                                v_table, v_table || '_update_owner');
    end if;
    if v_spec[2] like '%d%' then
      execute pg_catalog.format('create policy %2$I on public.%1$I for delete to authenticated using (' || v_owned || v_usable || ')',
                                v_table, v_table || '_delete_owner');
    end if;
  end loop;
end
$$;

-- ───────────────────────────── places ─────────────────────────────
grant select on public.places to anon, authenticated;
create policy places_select_anon on public.places for select to anon using (true);
create policy places_select_authenticated on public.places for select to authenticated using (true);

-- ───────────────────────────── saved_properties ─────────────────────────────
grant select, delete on public.saved_properties to authenticated;
grant insert (user_id, property_id) on public.saved_properties to authenticated;

create policy saved_properties_select_own on public.saved_properties
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy saved_properties_insert_own on public.saved_properties
  for insert to authenticated
  with check (user_id = (select auth.uid())
              and (select public.is_active_user())
              and exists (select 1 from public.properties p
                          where p.id = saved_properties.property_id and p.status = 'published' and p.deleted_at is null));

create policy saved_properties_delete_own on public.saved_properties
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ───────────────────────────── property_inquiries ─────────────────────────────
-- Read: the seeker, the property's owner, staff. No client writes (functions in the messaging stage).
grant select on public.property_inquiries to authenticated;

create policy property_inquiries_select_parties_or_staff on public.property_inquiries
  for select to authenticated
  using (seeker_id = (select auth.uid())
         or (select public.is_staff())
         or exists (select 1 from public.properties p
                    where p.id = property_inquiries.property_id and p.owner_id = (select auth.uid())));

-- ───────────────────────────── contact_reveals ─────────────────────────────
grant select on public.contact_reveals to authenticated;

create policy contact_reveals_select_own_or_staff on public.contact_reveals
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

-- ───────────────────────────── property_stats_daily ─────────────────────────────
grant select on public.property_stats_daily to authenticated;

create policy property_stats_daily_select_owner_or_staff on public.property_stats_daily
  for select to authenticated
  using ((select public.is_staff())
         or exists (select 1 from public.properties p
                    where p.id = property_stats_daily.property_id and p.owner_id = (select auth.uid())));

-- ───────────────────────────── verification_records ─────────────────────────────
-- The submitter inserts (always as "pending": status and review fields have no grant) and reads
-- their own; staff read all. Decisions happen only in admin_review_verification().
grant select on public.verification_records to authenticated;
grant insert (subject_type, subject_id, submitted_by, kind, document_path) on public.verification_records to authenticated;

create policy verification_records_select_own_or_staff on public.verification_records
  for select to authenticated
  using (submitted_by = (select auth.uid()) or (select public.is_staff()));

create policy verification_records_insert_own on public.verification_records
  for insert to authenticated
  with check (submitted_by = (select auth.uid())
              and (select public.is_active_user())
              and ((subject_type = 'owner' and subject_id = (select auth.uid()))
                   or (subject_type = 'property'
                       and exists (select 1 from public.properties p
                                   where p.id = verification_records.subject_id and p.owner_id = (select auth.uid())))));

-- ───────────────────────────── property_reviews ─────────────────────────────
grant select on public.property_reviews to anon, authenticated;
grant insert (property_id, author_id, rating, title, body) on public.property_reviews to authenticated;
grant update (rating, title, body) on public.property_reviews to authenticated;
grant delete on public.property_reviews to authenticated;

create policy property_reviews_select_anon on public.property_reviews
  for select to anon
  using (status = 'published' and deleted_at is null
         and exists (select 1 from public.properties p where p.id = property_reviews.property_id and p.status = 'published'));

-- the author always sees their own review (also when hidden / removed); staff see all
create policy property_reviews_select_authenticated on public.property_reviews
  for select to authenticated
  using ((status = 'published' and deleted_at is null
          and exists (select 1 from public.properties p where p.id = property_reviews.property_id))
         or author_id = (select auth.uid())
         or (select public.is_staff()));

-- Eligibility: the author enquired about this property (any enquiry, whatever its status — an
-- owner marking enquiries as spam must not be able to veto reviews), the listing is published,
-- and it is not the author's own. One per author per property by the unique constraint.
create policy property_reviews_insert_enquirer on public.property_reviews
  for insert to authenticated
  with check (author_id = (select auth.uid())
              and (select public.is_active_user())
              and exists (select 1 from public.properties p
                          where p.id = property_reviews.property_id
                            and p.status = 'published' and p.deleted_at is null
                            and p.owner_id <> (select auth.uid()))
              and exists (select 1 from public.property_inquiries i
                          where i.property_id = property_reviews.property_id and i.seeker_id = (select auth.uid())));

create policy property_reviews_update_author on public.property_reviews
  for update to authenticated
  using (author_id = (select auth.uid()) and status = 'published' and deleted_at is null and (select public.is_active_user()))
  with check (author_id = (select auth.uid()));

create policy property_reviews_delete_author on public.property_reviews
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- ───────────────────────────── owner_replies ─────────────────────────────
grant select on public.owner_replies to anon, authenticated;
grant insert (review_id, owner_id, body) on public.owner_replies to authenticated;
grant update (body) on public.owner_replies to authenticated;
grant delete on public.owner_replies to authenticated;

-- visible exactly when the review is visible to the caller (sub-select runs under the review RLS)
create policy owner_replies_select_anon on public.owner_replies
  for select to anon
  using (exists (select 1 from public.property_reviews r where r.id = owner_replies.review_id));
create policy owner_replies_select_authenticated on public.owner_replies
  for select to authenticated
  using (owner_id = (select auth.uid())
         or exists (select 1 from public.property_reviews r where r.id = owner_replies.review_id));

-- once per review (primary key), only on a published review of the owner's own property
create policy owner_replies_insert_owner on public.owner_replies
  for insert to authenticated
  with check (owner_id = (select auth.uid())
              and (select public.is_active_user())
              and exists (select 1
                          from public.property_reviews r
                          join public.properties p on p.id = r.property_id
                          where r.id = owner_replies.review_id
                            and r.status = 'published' and r.deleted_at is null
                            and p.owner_id = (select auth.uid())));

create policy owner_replies_update_owner on public.owner_replies
  for update to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_active_user()))
  with check (owner_id = (select auth.uid()));

create policy owner_replies_delete_owner on public.owner_replies
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ───────────────────────────── property_owner_cards ─────────────────────────────
-- The public face of an owner: never contact details. Deliberately NOT security_invoker (same
-- reasoning as public_user_cards in stage 1): it runs with its owner's rights to read past the
-- private property_owners / user_profiles RLS, which is safe because it projects only these six
-- columns and drops deleted accounts. security_barrier keeps caller predicates off hidden rows.
create view public.property_owner_cards
with (security_barrier = true, security_invoker = false)
as
  select o.user_id,
         coalesce(o.business_name, p.display_name) as display_name,
         o.owner_type,
         o.verification_status,
         o.verified_at,
         o.created_at as member_since
  from public.property_owners o
  join public.users u on u.id = o.user_id
  join public.user_profiles p on p.user_id = o.user_id
  where u.status <> 'deleted' and u.deleted_at is null;

comment on view public.property_owner_cards is 'Safe public card of every owner: user_id, display_name (business name, else the profile name), owner_type, verification_status, verified_at, member_since. Readable by anyone. Never add contact columns: those leave property_owners only through reveal_owner_contact().';

revoke all on public.property_owner_cards from anon, authenticated;
grant select on public.property_owner_cards to anon, authenticated, service_role;
