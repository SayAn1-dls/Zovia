-- ZUVIO stage 6 / 10 — imported OpenStreetMap places, more cities, local demo payments.
--
-- 1. osm_places: real places imported from OpenStreetMap (Nominatim) by scripts/import-osm.mjs
--    (trusted path, service role). category 'housing' = hostels / PGs / guest houses shown as
--    discovery ("not listed on ZUVIO, price and vacancy unknown"); 'poi' = colleges, stations,
--    hospitals... used for "nearby" on listings. Public read; no client writes.
-- 2. More tier-1/tier-2 cities (reference data; centre points approximate).
-- 3. Local demo payment (product-owner request): confirm_demo_payment() is service-role only and
--    the app calls it only outside production with PAYMENTS_DEMO_MODE=true. Payments made this
--    way are stored with provider 'demo' so they can never be mistaken for real money.

create table public.osm_places (
  id           text primary key,
  category     text not null,
  kind         text not null,
  name         text not null,
  city_slug    text not null references public.cities (slug) on delete cascade,
  location     extensions.geography(Point, 4326) not null,
  address      text,
  phone        text,
  website      text,
  gender_hint  public.tenant_gender,
  source_url   text not null,
  imported_at  timestamptz not null default now(),
  constraint osm_places_category check (category in ('housing', 'poi')),
  constraint osm_places_id_format check (id ~ '^osm:(node|way|relation)/[0-9]+$'),
  constraint osm_places_name_length check (char_length(name) between 1 and 200),
  constraint osm_places_text_lengths check (
    (address is null or char_length(address) <= 300) and (phone is null or char_length(phone) <= 40)
    and (website is null or char_length(website) <= 300) and char_length(kind) <= 40
  )
);
create index osm_places_location_idx on public.osm_places using gist (location);
create index osm_places_city_category_idx on public.osm_places (city_slug, category);

alter table public.osm_places enable row level security;
grant select on public.osm_places to anon, authenticated;
create policy osm_places_read_all_anon on public.osm_places for select to anon using (true);
create policy osm_places_read_all_authenticated on public.osm_places for select to authenticated using (true);

-- Nearby POIs from the imported data: straight-line distance, at most p_per_kind per kind.
create function public.nearby_osm_places(
  p_lat double precision, p_lng double precision, p_radius_m integer default 2500, p_per_kind integer default 4
)
returns table (id text, kind text, name text, lat double precision, lng double precision, distance_m double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  with origin as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  ),
  ranked as (
    select o.id, o.kind, o.name,
           extensions.st_y(o.location::extensions.geometry) as lat,
           extensions.st_x(o.location::extensions.geometry) as lng,
           extensions.st_distance(o.location, (select g from origin)) as distance_m,
           row_number() over (partition by o.kind order by extensions.st_distance(o.location, (select g from origin))) as rn
      from public.osm_places o
     where o.category = 'poi'
       and extensions.st_dwithin(o.location, (select g from origin), least(greatest(p_radius_m, 100), 5000))
  )
  select id, kind, name, lat, lng, distance_m from ranked
   where rn <= least(greatest(p_per_kind, 1), 10)
   order by kind, distance_m
$$;
grant execute on function public.nearby_osm_places(double precision, double precision, integer, integer) to anon, authenticated;

-- ───────────────────────────── more cities ─────────────────────────────
insert into public.cities (slug, name, state, location, is_active)
select v.slug, v.name, v.state, extensions.st_setsrid(extensions.st_makepoint(v.lng, v.lat), 4326)::extensions.geography, true
from (values
  ('lucknow', 'Lucknow', 'Uttar Pradesh', 26.8467, 80.9462),
  ('kanpur', 'Kanpur', 'Uttar Pradesh', 26.4499, 80.3319),
  ('varanasi', 'Varanasi', 'Uttar Pradesh', 25.3176, 82.9739),
  ('prayagraj', 'Prayagraj', 'Uttar Pradesh', 25.4358, 81.8463),
  ('agra', 'Agra', 'Uttar Pradesh', 27.1767, 78.0081),
  ('ghaziabad', 'Ghaziabad', 'Uttar Pradesh', 28.6692, 77.4538),
  ('greater-noida', 'Greater Noida', 'Uttar Pradesh', 28.4744, 77.5040),
  ('faridabad', 'Faridabad', 'Haryana', 28.4089, 77.3178),
  ('dehradun', 'Dehradun', 'Uttarakhand', 30.3165, 78.0322),
  ('ludhiana', 'Ludhiana', 'Punjab', 30.9010, 75.8573),
  ('amritsar', 'Amritsar', 'Punjab', 31.6340, 74.8723),
  ('bhopal', 'Bhopal', 'Madhya Pradesh', 23.2599, 77.4126),
  ('nagpur', 'Nagpur', 'Maharashtra', 21.1458, 79.0882),
  ('nashik', 'Nashik', 'Maharashtra', 19.9975, 73.7898),
  ('thane', 'Thane', 'Maharashtra', 19.2183, 72.9781),
  ('navi-mumbai', 'Navi Mumbai', 'Maharashtra', 19.0330, 73.0297),
  ('surat', 'Surat', 'Gujarat', 21.1702, 72.8311),
  ('vadodara', 'Vadodara', 'Gujarat', 22.3072, 73.1812),
  ('raipur', 'Raipur', 'Chhattisgarh', 21.2514, 81.6296),
  ('patna', 'Patna', 'Bihar', 25.5941, 85.1376),
  ('ranchi', 'Ranchi', 'Jharkhand', 23.3441, 85.3096),
  ('bhubaneswar', 'Bhubaneswar', 'Odisha', 20.2961, 85.8245),
  ('guwahati', 'Guwahati', 'Assam', 26.1445, 91.7362),
  ('visakhapatnam', 'Visakhapatnam', 'Andhra Pradesh', 17.6868, 83.2185),
  ('vijayawada', 'Vijayawada', 'Andhra Pradesh', 16.5062, 80.6480),
  ('coimbatore', 'Coimbatore', 'Tamil Nadu', 11.0168, 76.9558),
  ('madurai', 'Madurai', 'Tamil Nadu', 9.9252, 78.1198),
  ('kochi', 'Kochi', 'Kerala', 9.9312, 76.2673),
  ('thiruvananthapuram', 'Thiruvananthapuram', 'Kerala', 8.5241, 76.9366),
  ('mysuru', 'Mysuru', 'Karnataka', 12.2958, 76.6394),
  ('mangaluru', 'Mangaluru', 'Karnataka', 12.9141, 74.8560),
  ('manipal', 'Manipal', 'Karnataka', 13.3525, 74.7928)
) as v(slug, name, state, lat, lng)
on conflict (slug) do nothing;

-- ───────────────────────────── demo payments (local only) ─────────────────────────────
alter table public.payments drop constraint payments_provider;
alter table public.payments add constraint payments_provider check (provider in ('razorpay', 'demo'));

create function public.confirm_demo_payment(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found or v_b.status <> 'accepted' then
    raise exception using errcode = 'ZV409', message = 'This booking is not waiting for payment.';
  end if;
  insert into public.payments (booking_id, provider, provider_order_id, provider_payment_id, amount_paise, status, paid_at)
  values (v_b.id, 'demo', 'demo_' || v_b.id::text, 'demo_' || v_b.id::text, v_b.amount_inr::bigint * 100, 'paid', now())
  on conflict (provider, provider_order_id) do nothing;
  update public.bookings set status = 'confirmed', confirmed_at = now() where id = v_b.id;
  if v_b.bed_id is not null then
    update public.beds set status = 'reserved', available_from = null where id = v_b.bed_id;
  end if;
  perform public.notify(v_b.owner_id, 'system', 'Booking confirmed (demo payment)', null, '/owner/bookings');
  perform public.notify(v_b.seeker_id, 'system', 'Your booking is confirmed (demo payment)', null, '/bookings/' || v_b.id::text);
  return v_b.id;
end
$$;
revoke all on function public.confirm_demo_payment(uuid) from public, anon, authenticated;
grant execute on function public.confirm_demo_payment(uuid) to service_role;
