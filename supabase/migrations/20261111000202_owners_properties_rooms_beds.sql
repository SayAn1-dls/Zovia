-- ZUVIO stage 2 / 02 — owners, properties, rooms, beds (spec 6.2).
-- Property, room and bed are separate entities: a property has many rooms, a room has many beds.
-- Triggers are in 20261111000206/07, policies and grants in 20261111000208. RLS is enabled here
-- so no table ever exists without it (not forced: SECURITY DEFINER functions must cross it).
-- Money is integer INR, 0 .. 1 crore.

-- ───────────────────────────── property_owners ─────────────────────────────
create table public.property_owners (
  user_id             uuid primary key references public.users (id) on delete cascade,
  owner_type          public.owner_type not null default 'individual',
  business_name       text,
  contact_phone       text,
  contact_email       extensions.citext,
  whatsapp_number     text,
  about               text,
  verification_status public.verification_status not null default 'unverified',
  verified_at         timestamptz,
  verified_by         uuid references public.users (id) on delete set null,
  phone_verified_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint property_owners_business_name_length check (business_name is null or (char_length(business_name) between 2 and 120 and business_name = btrim(business_name))),
  -- digits only with an optional leading +, e.g. 9876543210 or +919876543210
  constraint property_owners_contact_phone_format check (contact_phone is null or contact_phone ~ '^\+?[1-9][0-9]{9,14}$'),
  constraint property_owners_whatsapp_format check (whatsapp_number is null or whatsapp_number ~ '^\+?[1-9][0-9]{9,14}$'),
  constraint property_owners_contact_email_format check (
    contact_email is null
    or (char_length(contact_email::text) <= 254 and contact_email::text ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$')
  ),
  constraint property_owners_about_length check (about is null or char_length(about) <= 1000),
  constraint property_owners_verified_consistent check (verification_status <> 'verified' or verified_at is not null)
);
comment on table public.property_owners is 'Owner / operator profile (1:1 with users), created by become_owner(). PRIVATE: readable by the owner and staff only. Contact details leave this table only through reveal_owner_contact() and to the other party of an enquiry; everyone else sees the property_owner_cards view.';
comment on column public.property_owners.verification_status is 'Trust signal "Owner verified": identity documents reviewed by staff. Changed only by admin_review_verification() / submit_verification_record(). Independent of phone verification and of property authorisation.';
comment on column public.property_owners.phone_verified_at is 'Recorded for information only: a verified phone is never proof of ownership.';

create index property_owners_verified_by_idx on public.property_owners (verified_by) where verified_by is not null;
create index property_owners_verification_status_idx on public.property_owners (verification_status) where verification_status <> 'unverified';
create index property_owners_contact_phone_idx on public.property_owners (contact_phone) where contact_phone is not null;

create trigger property_owners_set_updated_at before update on public.property_owners
  for each row execute function public.set_updated_at();

alter table public.property_owners enable row level security;

-- ───────────────────────────── properties ─────────────────────────────
create table public.properties (
  id                           uuid primary key default gen_random_uuid(),
  owner_id                     uuid not null references public.property_owners (user_id) on delete cascade,
  slug                         text not null,
  title                        text not null,
  description                  text,
  property_type                public.property_type not null,
  listing_mode                 public.listing_mode not null,
  tenant_gender                public.tenant_gender not null default 'any',
  furnishing                   public.furnishing,
  -- address
  address_line                 text,
  locality                     text,
  city                         text,
  state                        text,
  pincode                      text,
  landmark                     text,
  location                     extensions.geography(Point, 4326),
  -- pricing (integer INR)
  monthly_rent                 integer,
  security_deposit             integer,
  maintenance_monthly          integer,
  electricity_billing          public.utility_billing,
  electricity_monthly_estimate integer,
  water_billing                public.utility_billing,
  water_monthly_estimate       integer,
  food_available               boolean not null default false,
  food_included                boolean not null default false,
  food_monthly_charge          integer,
  meals_breakfast              boolean not null default false,
  meals_lunch                  boolean not null default false,
  meals_dinner                 boolean not null default false,
  -- lifecycle (written only by the lifecycle trigger and trusted functions)
  status                       public.listing_status not null default 'draft',
  rejection_reason             text,
  submitted_at                 timestamptz,
  approved_at                  timestamptz,
  published_at                 timestamptz,
  last_confirmed_at            timestamptz,
  -- denormalised for search (written only by refresh_property_search_fields / triggers)
  min_rent                     integer,
  max_rent                     integer,
  total_beds                   integer not null default 0,
  available_beds               integer not null default 0,
  occupancy_options            smallint[] not null default '{}',
  amenity_codes                text[] not null default '{}',
  has_ac                       boolean not null default false,
  has_attached_bathroom        boolean not null default false,
  cover_media_path             text,
  rating_avg                   numeric(3,2),
  rating_count                 integer not null default 0,
  search_tsv                   tsvector,
  deleted_at                   timestamptz,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),

  constraint properties_slug_key unique (slug),
  constraint properties_slug_format check (char_length(slug) <= 120 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint properties_title_valid check (char_length(title) between 3 and 120 and title = btrim(title)),
  constraint properties_description_length check (description is null or char_length(description) <= 4000),
  constraint properties_address_line_length check (address_line is null or char_length(address_line) between 3 and 200),
  constraint properties_locality_length check (locality is null or char_length(locality) between 2 and 80),
  constraint properties_city_length check (city is null or char_length(city) between 2 and 80),
  constraint properties_state_length check (state is null or char_length(state) between 2 and 60),
  constraint properties_pincode_format check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  constraint properties_landmark_length check (landmark is null or char_length(landmark) between 2 and 120),
  -- a pin must be a real place in or around India (rejects 0,0 and swapped lat/lng)
  constraint properties_location_in_india check (
    location is null
    or (extensions.st_y(location::extensions.geometry) between 6 and 38
        and extensions.st_x(location::extensions.geometry) between 68 and 98)
  ),
  constraint properties_monthly_rent_range check (monthly_rent is null or monthly_rent between 0 and 10000000),
  constraint properties_security_deposit_range check (security_deposit is null or security_deposit between 0 and 10000000),
  constraint properties_maintenance_range check (maintenance_monthly is null or maintenance_monthly between 0 and 10000000),
  constraint properties_electricity_estimate_range check (electricity_monthly_estimate is null or electricity_monthly_estimate between 0 and 10000000),
  constraint properties_water_estimate_range check (water_monthly_estimate is null or water_monthly_estimate between 0 and 10000000),
  constraint properties_food_charge_range check (food_monthly_charge is null or food_monthly_charge between 0 and 10000000),
  constraint properties_food_consistent check (food_available or (not food_included and food_monthly_charge is null)),
  constraint properties_rejection_reason_length check (rejection_reason is null or char_length(rejection_reason) between 1 and 500),
  -- a listing can leave draft only with a map pin; an entire-unit listing also needs its rent
  constraint properties_location_required check (status in ('draft', 'archived') or location is not null),
  constraint properties_entire_unit_rent_required check (
    listing_mode <> 'entire_unit' or status in ('draft', 'archived') or monthly_rent is not null
  ),
  constraint properties_rent_order check (min_rent is null or max_rent is null or min_rent <= max_rent),
  constraint properties_bed_counts check (total_beds >= 0 and available_beds between 0 and total_beds),
  constraint properties_rating_range check (rating_count >= 0 and (rating_avg is null or rating_avg between 1 and 5))
);
comment on table public.properties is 'A listing. Only status = published (and not soft-deleted) is publicly visible; the owner sees and edits their own in any status; staff read all. status and the lifecycle timestamps move only through the lifecycle trigger (owners: submit/pause/resume/archive functions; staff: admin_review_property). The denormalised search columns are maintained by triggers and are never client-writable.';
comment on column public.properties.slug is 'URL slug "<title>-<locality>-<8 hex of id>", set by trigger. Regenerated while the listing is a never-published draft; frozen afterwards.';
comment on column public.properties.location is 'Map pin, geography(Point, 4326) — longitude first in ST_MakePoint. Required before the listing can leave draft.';
comment on column public.properties.monthly_rent is 'Rent of the whole unit for entire_unit listings (required before leaving draft). Unused for per_bed listings, whose prices live on rooms and beds.';
comment on column public.properties.security_deposit is 'Deposit for entire_unit listings; per_bed listings use rooms.security_deposit.';
comment on column public.properties.last_confirmed_at is 'Trust signal "Listing recently confirmed": when the owner last confirmed the listing is accurate (stamped on submission for review and by confirm_listing()). Fresh for platform_settings.listing_fresh_days.';
comment on column public.properties.min_rent is 'Denormalised. per_bed: cheapest bed (rent_override, else the room''s rent_per_bed; rooms without beds count with rent_per_bed). entire_unit: monthly_rent.';
comment on column public.properties.total_beds is 'Denormalised: beds in rooms that are not soft-deleted.';
comment on column public.properties.available_beds is 'Denormalised: beds with status = available (whatever their available_from date).';
comment on column public.properties.occupancy_options is 'Denormalised: distinct room capacities, ascending (1 = private, 2 = double sharing ...).';
comment on column public.properties.amenity_codes is 'Denormalised: amenity codes from property_amenities, ascending.';
comment on column public.properties.has_ac is 'Denormalised: any room has_ac, or the "ac" amenity is selected.';
comment on column public.properties.has_attached_bathroom is 'Denormalised: any room has_attached_bathroom, or the "attached_bathroom" amenity is selected.';
comment on column public.properties.cover_media_path is 'Denormalised: storage path of the cover image (is_cover, else the first image by position).';
comment on column public.properties.rating_avg is 'Denormalised: average rating of published reviews, NULL when there are none.';
comment on column public.properties.search_tsv is 'Denormalised full-text vector, config "english" over unaccented text: title (A), locality + city + property type (B), landmark + address + pincode (C), description (D). Query with websearch_to_tsquery(''english'', extensions.unaccent(''extensions.unaccent'', q)).';

create index properties_owner_idx on public.properties (owner_id);
create index properties_status_idx on public.properties (status, submitted_at) where status in ('pending_review', 'rejected', 'paused');
create index properties_location_idx on public.properties using gist (location);
create index properties_search_tsv_idx on public.properties using gin (search_tsv);
create index properties_amenity_codes_idx on public.properties using gin (amenity_codes);
create index properties_locality_trgm_idx on public.properties using gin (locality extensions.gin_trgm_ops);
create index properties_city_trgm_idx on public.properties using gin (city extensions.gin_trgm_ops);
-- partial B-trees over what the public can see (search always filters on exactly this predicate)
create index properties_published_city_rent_idx on public.properties (lower(city), min_rent)
  where status = 'published' and deleted_at is null;
create index properties_published_type_idx on public.properties (property_type, min_rent)
  where status = 'published' and deleted_at is null;
create index properties_published_min_rent_idx on public.properties (min_rent)
  where status = 'published' and deleted_at is null;
create index properties_published_available_beds_idx on public.properties (available_beds)
  where status = 'published' and deleted_at is null and available_beds > 0;
create index properties_published_pincode_idx on public.properties (pincode)
  where status = 'published' and deleted_at is null;
create index properties_published_newest_idx on public.properties (published_at desc)
  where status = 'published' and deleted_at is null;
create index properties_published_confirmed_idx on public.properties (last_confirmed_at)
  where status = 'published' and deleted_at is null;

create trigger properties_set_updated_at before update on public.properties
  for each row execute function public.set_updated_at();

alter table public.properties enable row level security;

-- ───────────────────────────── rooms ─────────────────────────────
create table public.rooms (
  id                    uuid primary key default gen_random_uuid(),
  property_id           uuid not null references public.properties (id) on delete cascade,
  name                  text not null,
  room_type             public.room_type not null default 'shared',
  capacity              smallint not null default 1,
  rent_per_bed          integer,
  security_deposit      integer,
  has_attached_bathroom boolean not null default false,
  has_ac                boolean not null default false,
  has_balcony           boolean not null default false,
  floor                 smallint,
  area_sqft             integer,
  description           text,
  position              smallint not null default 0,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- target of the composite foreign keys that keep a child's property_id equal to its room's
  constraint rooms_id_property_key unique (id, property_id),
  constraint rooms_name_length check (char_length(name) between 1 and 60 and name = btrim(name)),
  constraint rooms_capacity_range check (capacity between 1 and 12),
  constraint rooms_rent_range check (rent_per_bed is null or rent_per_bed between 0 and 10000000),
  constraint rooms_security_deposit_range check (security_deposit is null or security_deposit between 0 and 10000000),
  constraint rooms_floor_range check (floor is null or floor between -3 and 150),
  constraint rooms_area_range check (area_sqft is null or area_sqft between 20 and 100000),
  constraint rooms_description_length check (description is null or char_length(description) <= 1000),
  constraint rooms_position_range check (position >= 0)
);
comment on table public.rooms is 'A room of a property. capacity = how many people share it (1..12) and the maximum number of beds. rent_per_bed is the monthly rent of one bed (per_bed listings). Visible when the property is visible; soft-deleted rooms (deleted_at) are hidden from the public and leave the denormalised counts.';

create index rooms_property_idx on public.rooms (property_id, position);

create trigger rooms_set_updated_at before update on public.rooms
  for each row execute function public.set_updated_at();

alter table public.rooms enable row level security;

-- ───────────────────────────── beds ─────────────────────────────
create table public.beds (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null,
  -- always the room's property: filled in by trigger and guaranteed by the composite foreign key
  property_id    uuid not null references public.properties (id) on delete cascade,
  label          text not null,
  status         public.bed_status not null default 'available',
  available_from date,
  rent_override  integer,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint beds_room_property_fkey foreign key (room_id, property_id)
    references public.rooms (id, property_id) on delete cascade,
  constraint beds_id_property_key unique (id, property_id),
  constraint beds_room_label_key unique (room_id, label),
  constraint beds_label_length check (char_length(label) between 1 and 30 and label = btrim(label)),
  constraint beds_rent_override_range check (rent_override is null or rent_override between 0 and 10000000),
  constraint beds_available_from_range check (available_from is null or available_from between date '2020-01-01' and date '2100-01-01')
);
comment on table public.beds is 'A bed in a room: the unit that is let in per_bed listings. status available | reserved | occupied | blocked; available_from is the date an available bed frees up (NULL = now). rent_override replaces the room''s rent_per_bed for this bed. A room can never hold more beds than its capacity (trigger). Bed availability is shown separately from property availability ("3 of 8 beds available").';

create index beds_room_idx on public.beds (room_id);
create index beds_property_status_idx on public.beds (property_id, status);

create trigger beds_set_updated_at before update on public.beds
  for each row execute function public.set_updated_at();

alter table public.beds enable row level security;
