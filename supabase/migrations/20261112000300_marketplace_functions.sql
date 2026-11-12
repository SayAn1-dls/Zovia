-- ZUVIO stage 3 / 00 — marketplace functions: becoming an owner, the listing lifecycle (owner and
-- staff), public search, enquiries, owner contact reveal, and the storage buckets for photos.
--
-- Every function re-derives the caller from auth.uid() and enforces its own rules; nothing here
-- trusts an id, role, owner or status sent by the client. Errors use the ZV SQLSTATE contract.

-- ───────────────────────────── become_owner ─────────────────────────────
create function public.become_owner(
  p_owner_type      public.owner_type,
  p_contact_phone   text,
  p_business_name   text default null,
  p_contact_email   text default null,
  p_whatsapp_number text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = 'ZV401', message = 'Please sign in to continue.';
  end if;
  if not public.is_active_user() then
    raise exception using errcode = 'ZV423', message = 'Your account cannot list properties right now.';
  end if;
  if p_contact_phone is null or btrim(p_contact_phone) !~ '^\+?[1-9][0-9]{9,14}$' then
    raise exception using errcode = 'ZV422', message = 'Enter a valid phone number, like 9876543210.';
  end if;

  insert into public.property_owners (user_id, owner_type, business_name, contact_phone, contact_email, whatsapp_number)
  values (v_uid, p_owner_type, nullif(btrim(p_business_name), ''), btrim(p_contact_phone),
          nullif(btrim(p_contact_email), ''), nullif(btrim(p_whatsapp_number), ''))
  on conflict (user_id) do update
    set owner_type = excluded.owner_type,
        business_name = excluded.business_name,
        contact_phone = excluded.contact_phone,
        contact_email = excluded.contact_email,
        whatsapp_number = excluded.whatsapp_number;

  insert into public.user_roles (user_id, role) values (v_uid, 'owner') on conflict (user_id, role) do nothing;
end
$$;
revoke all on function public.become_owner(public.owner_type, text, text, text, text) from public, anon;
grant execute on function public.become_owner(public.owner_type, text, text, text, text) to authenticated;

-- ───────────────────────────── owner lifecycle ─────────────────────────────
-- Internal: the caller's own, non-deleted property, locked for update.
create function public.owned_property_for_update(p_property_id uuid)
returns public.properties
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.properties;
begin
  if auth.uid() is null then
    raise exception using errcode = 'ZV401', message = 'Please sign in to continue.';
  end if;
  select * into v_row from public.properties
   where id = p_property_id and owner_id = auth.uid() and deleted_at is null
   for update;
  if not found then
    raise exception using errcode = 'ZV404', message = 'Listing not found.';
  end if;
  if not public.is_active_user() or public.has_active_restriction('listing') then
    raise exception using errcode = 'ZV423', message = 'Your account cannot change listings right now.';
  end if;
  return v_row;
end
$$;
revoke all on function public.owned_property_for_update(uuid) from public, anon, authenticated;

-- Checks completeness, then draft|rejected -> pending_review. Returns the list of what is missing
-- (empty array = submitted).
create function public.submit_property_for_review(p_property_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row     public.properties;
  v_missing text[] := '{}';
begin
  v_row := public.owned_property_for_update(p_property_id);
  if v_row.status not in ('draft', 'rejected') then
    raise exception using errcode = 'ZV409', message = 'Only a draft or rejected listing can be submitted.';
  end if;

  if v_row.description is null or char_length(v_row.description) < 30 then v_missing := v_missing || 'description'; end if;
  if v_row.city is null or v_row.locality is null or v_row.address_line is null then v_missing := v_missing || 'address'; end if;
  if v_row.location is null then v_missing := v_missing || 'map_pin'; end if;
  if not exists (select 1 from public.property_media m where m.property_id = v_row.id and m.kind = 'image') then
    v_missing := v_missing || 'photos';
  end if;
  if v_row.listing_mode = 'per_bed' then
    if not exists (select 1 from public.beds b where b.property_id = v_row.id) then v_missing := v_missing || 'beds'; end if;
  else
    if v_row.monthly_rent is null then v_missing := v_missing || 'rent'; end if;
    if not exists (select 1 from public.property_availability a where a.property_id = v_row.id) then
      v_missing := v_missing || 'availability';
    end if;
  end if;
  if cardinality(v_missing) > 0 then return v_missing; end if;

  perform set_config('zuvio.listing_actor', 'owner', true);
  update public.properties set status = 'pending_review' where id = v_row.id;
  perform set_config('zuvio.listing_actor', '', true);
  return '{}';
end
$$;
revoke all on function public.submit_property_for_review(uuid) from public, anon;
grant execute on function public.submit_property_for_review(uuid) to authenticated;

-- Owner: published <-> paused, any -> archived. Also confirms the listing is still accurate.
create function public.owner_set_listing_status(p_property_id uuid, p_status public.listing_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.properties;
begin
  v_row := public.owned_property_for_update(p_property_id);
  if p_status not in ('published', 'paused', 'archived') then
    raise exception using errcode = 'ZV422', message = 'That status cannot be set here.';
  end if;
  perform set_config('zuvio.listing_actor', 'owner', true);
  update public.properties set status = p_status where id = v_row.id;
  perform set_config('zuvio.listing_actor', '', true);
end
$$;
revoke all on function public.owner_set_listing_status(uuid, public.listing_status) from public, anon;
grant execute on function public.owner_set_listing_status(uuid, public.listing_status) to authenticated;

-- "Listing information recently confirmed" trust signal.
create function public.confirm_listing(p_property_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.properties;
begin
  v_row := public.owned_property_for_update(p_property_id);
  perform set_config('zuvio.listing_actor', 'system', true);
  update public.properties set last_confirmed_at = now() where id = v_row.id;
  perform set_config('zuvio.listing_actor', '', true);
end
$$;
revoke all on function public.confirm_listing(uuid) from public, anon;
grant execute on function public.confirm_listing(uuid) to authenticated;

-- ───────────────────────────── staff review ─────────────────────────────
create function public.admin_review_property(p_property_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.properties;
begin
  if not public.is_staff() then
    raise exception using errcode = 'ZV403', message = 'Only staff can review listings.';
  end if;
  select * into v_row from public.properties where id = p_property_id and deleted_at is null for update;
  if not found then
    raise exception using errcode = 'ZV404', message = 'Listing not found.';
  end if;
  if p_approve and v_row.status <> 'pending_review' then
    raise exception using errcode = 'ZV409', message = 'Only a listing waiting for review can be approved.';
  end if;
  if not p_approve and (p_reason is null or char_length(btrim(p_reason)) < 5) then
    raise exception using errcode = 'ZV422', message = 'Give the owner a reason (at least 5 characters).';
  end if;

  perform set_config('zuvio.listing_actor', 'staff', true);
  if p_approve then
    update public.properties set status = 'published' where id = v_row.id;
  else
    update public.properties set status = 'rejected', rejection_reason = btrim(p_reason) where id = v_row.id;
  end if;
  perform set_config('zuvio.listing_actor', '', true);

  perform public.audit(case when p_approve then 'property.approve' else 'property.reject' end, 'property', v_row.id,
                       jsonb_build_object('reason', p_reason, 'from_status', v_row.status));
  perform public.notify(
    v_row.owner_id,
    case when p_approve then 'listing_approved'::public.notification_type else 'listing_rejected'::public.notification_type end,
    case when p_approve then 'Your listing is live' else 'Your listing needs changes' end,
    case when p_approve then v_row.title else btrim(p_reason) end,
    '/owner/properties/' || v_row.id::text
  );
end
$$;
revoke all on function public.admin_review_property(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_property(uuid, boolean, text) to authenticated;

-- ───────────────────────────── search ─────────────────────────────
-- SECURITY INVOKER: RLS applies, so only published listings are ever returned to the public.
create function public.search_properties(
  p_city           text default null,
  p_q              text default null,
  p_types          public.property_type[] default null,
  p_budget_min     integer default null,
  p_budget_max     integer default null,
  p_gender         public.tenant_gender default null,
  p_food           boolean default null,
  p_amenities      text[] default null,
  p_furnishing     public.furnishing default null,
  p_available_only boolean default false,
  p_lat            double precision default null,
  p_lng            double precision default null,
  p_radius_m       integer default null,
  p_sort           text default 'relevance',
  p_limit          integer default 20,
  p_offset         integer default 0
)
returns table (
  id uuid, slug text, title text, property_type public.property_type, listing_mode public.listing_mode,
  tenant_gender public.tenant_gender, furnishing public.furnishing, locality text, city text,
  price_from integer, available_beds integer, total_beds integer, amenity_codes text[], food_available boolean,
  cover_media_path text, rating_avg numeric, rating_count integer, last_confirmed_at timestamptz,
  lat double precision, lng double precision, distance_m double precision, total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with point as (
    select case when p_lat is not null and p_lng is not null
                then extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end as g
  ),
  matches as (
    select p.*,
           coalesce(p.min_rent, p.monthly_rent) as price,
           case when (select g from point) is not null and p.location is not null
                then extensions.st_distance(p.location, (select g from point)) end as dist,
           case when nullif(btrim(p_q), '') is not null
                then ts_rank(p.search_tsv, websearch_to_tsquery('simple', p_q)) else 0 end as rank
      from public.properties p
     where p.status = 'published' and p.deleted_at is null
       and (p_city is null or lower(p.city) = lower(p_city)
            or exists (select 1 from public.cities c where c.slug = lower(p_city) and lower(c.name) = lower(p.city)))
       and (nullif(btrim(p_q), '') is null
            or p.search_tsv @@ websearch_to_tsquery('simple', p_q)
            or p.locality ilike '%' || btrim(p_q) || '%'
            or p.pincode = btrim(p_q))
       and (p_types is null or cardinality(p_types) = 0 or p.property_type = any (p_types))
       and (p_budget_min is null or coalesce(p.max_rent, p.monthly_rent) >= p_budget_min)
       and (p_budget_max is null or coalesce(p.min_rent, p.monthly_rent) <= p_budget_max)
       and (p_gender is null or p.tenant_gender in ('any', p_gender))
       and (p_food is not true or p.food_available)
       and (p_amenities is null or p.amenity_codes @> p_amenities)
       and (p_furnishing is null or p.furnishing = p_furnishing)
       and (not p_available_only
            or (p.listing_mode = 'per_bed' and p.available_beds > 0)
            or (p.listing_mode = 'entire_unit' and exists (
                  select 1 from public.property_availability a
                   where a.property_id = p.id and a.status in ('available', 'limited'))))
       and ((select g from point) is null or p_radius_m is null
            or extensions.st_dwithin(p.location, (select g from point), least(p_radius_m, 50000)))
  )
  select m.id, m.slug, m.title, m.property_type, m.listing_mode, m.tenant_gender, m.furnishing, m.locality, m.city,
         m.price, m.available_beds, m.total_beds, m.amenity_codes, m.food_available, m.cover_media_path,
         m.rating_avg, m.rating_count, m.last_confirmed_at,
         extensions.st_y(m.location::extensions.geometry), extensions.st_x(m.location::extensions.geometry), m.dist,
         count(*) over ()
    from matches m
   order by
     case when p_sort = 'price_asc' then m.price end asc nulls last,
     case when p_sort = 'price_desc' then m.price end desc nulls last,
     case when p_sort = 'distance' then m.dist end asc nulls last,
     case when p_sort = 'newest' then m.published_at end desc nulls last,
     m.rank desc, m.last_confirmed_at desc nulls last, m.id
   limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;
grant execute on function public.search_properties(text, text, public.property_type[], integer, integer, public.tenant_gender,
  boolean, text[], public.furnishing, boolean, double precision, double precision, integer, text, integer, integer)
  to anon, authenticated;

-- ───────────────────────────── enquiries and owner contact ─────────────────────────────
create function public.create_property_inquiry(
  p_property_id  uuid,
  p_message      text,
  p_move_in_date date default null,
  p_occupants    smallint default 1,
  p_room_id      uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_prop public.properties;
  v_id   uuid;
begin
  if v_uid is null then
    raise exception using errcode = 'ZV401', message = 'Please sign in to contact the owner.';
  end if;
  if not public.is_active_user() then
    raise exception using errcode = 'ZV423', message = 'Your account cannot send enquiries right now.';
  end if;
  select * into v_prop from public.properties where id = p_property_id and status = 'published' and deleted_at is null;
  if not found then
    raise exception using errcode = 'ZV404', message = 'Listing not found.';
  end if;
  if v_prop.owner_id = v_uid then
    raise exception using errcode = 'ZV409', message = 'This is your own listing.';
  end if;
  if p_message is null or char_length(btrim(p_message)) not between 10 and 1000 then
    raise exception using errcode = 'ZV422', message = 'Write a message of 10 to 1,000 characters.';
  end if;
  if p_room_id is not null and not exists (select 1 from public.rooms r where r.id = p_room_id and r.property_id = p_property_id) then
    raise exception using errcode = 'ZV422', message = 'That room is not part of this listing.';
  end if;
  if not public.consume_rate_limit('property_inquiry', 10, 3600) then
    raise exception using errcode = 'ZV429', message = 'You have sent many enquiries. Please wait a while.';
  end if;

  insert into public.property_inquiries (property_id, seeker_id, room_id, message, move_in_date, occupants)
  values (p_property_id, v_uid, p_room_id, btrim(p_message), p_move_in_date, greatest(coalesce(p_occupants, 1), 1))
  returning id into v_id;

  perform public.notify(v_prop.owner_id, 'inquiry_received', 'New enquiry', v_prop.title, '/owner/inquiries');
  return v_id;
end
$$;
revoke all on function public.create_property_inquiry(uuid, text, date, smallint, uuid) from public, anon;
grant execute on function public.create_property_inquiry(uuid, text, date, smallint, uuid) to authenticated;

-- Owner phone / WhatsApp for a published listing, to signed-in active users, rate limited and recorded.
create function public.reveal_owner_contact(p_property_id uuid)
returns table (display_name text, contact_phone text, whatsapp_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_prop public.properties;
begin
  if v_uid is null then
    raise exception using errcode = 'ZV401', message = 'Please sign in to see the owner''s number.';
  end if;
  if not public.is_active_user() then
    raise exception using errcode = 'ZV423', message = 'Your account cannot do this right now.';
  end if;
  select * into v_prop from public.properties where id = p_property_id and status = 'published' and deleted_at is null;
  if not found then
    raise exception using errcode = 'ZV404', message = 'Listing not found.';
  end if;
  if not public.consume_rate_limit('contact_reveal', 20, 86400) then
    raise exception using errcode = 'ZV429', message = 'You have viewed many numbers today. Please try tomorrow.';
  end if;
  insert into public.contact_reveals (user_id, property_id) values (v_uid, p_property_id);
  return query
    select coalesce(o.business_name, pr.display_name), o.contact_phone, o.whatsapp_number
      from public.property_owners o
      join public.user_profiles pr on pr.user_id = o.user_id
     where o.user_id = v_prop.owner_id;
end
$$;
revoke all on function public.reveal_owner_contact(uuid) from public, anon;
grant execute on function public.reveal_owner_contact(uuid) to authenticated;

-- ───────────────────────────── storage ─────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-media', 'property-media', true, 8388608, array['image/jpeg', 'image/png', 'image/webp']),
       ('avatars', 'avatars', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- property-media/<property_id>/<file>: only that property's owner writes; everyone reads (public bucket).
create policy property_media_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'property-media'
              and exists (select 1 from public.properties p
                           where p.id::text = (storage.foldername(name))[1]
                             and p.owner_id = (select auth.uid()) and p.deleted_at is null));
create policy property_media_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'property-media'
         and exists (select 1 from public.properties p
                      where p.id::text = (storage.foldername(name))[1] and p.owner_id = (select auth.uid())));

-- avatars/<user_id>/<file>: the user only.
create policy avatars_own_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_own_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
