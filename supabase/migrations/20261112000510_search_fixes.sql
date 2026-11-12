-- ZUVIO stage 5 / 10 — search fixes.
-- 1. search_properties: the query used the 'simple' config while search_tsv is built with
--    'english' over unaccented text, so stemmed words ("hostels") missed. Same config now.
-- 2. listing_fresh_days(): public read of the "recently confirmed" window, so public pages do
--    not hardcode it (platform_settings itself is staff-only).

create or replace function public.search_properties(
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
                then ts_rank(p.search_tsv, websearch_to_tsquery('pg_catalog.english'::pg_catalog.regconfig, extensions.unaccent('extensions.unaccent'::pg_catalog.regdictionary, p_q))) else 0 end as rank
      from public.properties p
     where p.status = 'published' and p.deleted_at is null
       and (p_city is null or lower(p.city) = lower(p_city)
            or exists (select 1 from public.cities c where c.slug = lower(p_city) and lower(c.name) = lower(p.city)))
       and (nullif(btrim(p_q), '') is null
            or p.search_tsv @@ websearch_to_tsquery('pg_catalog.english'::pg_catalog.regconfig, extensions.unaccent('extensions.unaccent'::pg_catalog.regdictionary, p_q))
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


create function public.listing_fresh_days()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select public.setting_int('listing_fresh_days', 30)
$$;
revoke all on function public.listing_fresh_days() from public;
grant execute on function public.listing_fresh_days() to anon, authenticated;

-- 3. submit_property_for_review: `text[] || 'literal'` was parsed as array || array and raised
--    22P02 whenever something was missing. array_append is unambiguous.
create or replace function public.submit_property_for_review(p_property_id uuid)
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

  if v_row.description is null or char_length(v_row.description) < 30 then v_missing := array_append(v_missing, 'description'); end if;
  if v_row.city is null or v_row.locality is null or v_row.address_line is null then v_missing := array_append(v_missing, 'address'); end if;
  if v_row.location is null then v_missing := array_append(v_missing, 'map_pin'); end if;
  if not exists (select 1 from public.property_media m where m.property_id = v_row.id and m.kind = 'image') then
    v_missing := array_append(v_missing, 'photos');
  end if;
  if v_row.listing_mode = 'per_bed' then
    if not exists (select 1 from public.beds b where b.property_id = v_row.id) then v_missing := array_append(v_missing, 'beds'); end if;
  else
    if v_row.monthly_rent is null then v_missing := array_append(v_missing, 'rent'); end if;
    if not exists (select 1 from public.property_availability a where a.property_id = v_row.id) then
      v_missing := array_append(v_missing, 'availability');
    end if;
  end if;
  if cardinality(v_missing) > 0 then return v_missing; end if;

  perform set_config('zuvio.listing_actor', 'owner', true);
  update public.properties set status = 'pending_review' where id = v_row.id;
  perform set_config('zuvio.listing_actor', '', true);
  return '{}';
end
$$;

-- 4. Owner closes an enquiry or marks it spam (responded is set by the chat flow).
create function public.owner_set_inquiry_status(p_inquiry_id uuid, p_status public.inquiry_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'ZV401', message = 'Please sign in.';
  end if;
  if p_status not in ('closed', 'spam', 'responded') then
    raise exception using errcode = 'ZV422', message = 'That status cannot be set here.';
  end if;
  update public.property_inquiries i
     set status = p_status
   where i.id = p_inquiry_id
     and exists (select 1 from public.properties p where p.id = i.property_id and p.owner_id = auth.uid());
  if not found then
    raise exception using errcode = 'ZV404', message = 'Enquiry not found.';
  end if;
end
$$;
revoke all on function public.owner_set_inquiry_status(uuid, public.inquiry_status) from public, anon;
grant execute on function public.owner_set_inquiry_status(uuid, public.inquiry_status) to authenticated;
