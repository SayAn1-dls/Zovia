-- ZUVIO stage 2 / 00 — marketplace enum types (spec 6.2 and the review tables of 6.5).
-- Adding a value later: `alter type public.<name> add value '<value>';` in its own migration.

create type public.property_type as enum (
  'pg', 'boys_pg', 'girls_pg', 'hostel', 'co_living', 'private_room', 'shared_room',
  'studio', 'one_bhk', 'two_bhk', 'three_bhk', 'independent_house'
);

create type public.listing_mode as enum ('per_bed', 'entire_unit');
comment on type public.listing_mode is 'per_bed: rooms and beds are let individually (PG, hostel, co-living); availability is derived from bed statuses. entire_unit: the whole unit is let for properties.monthly_rent; the owner states availability.';

create type public.tenant_gender as enum ('any', 'male', 'female');

create type public.furnishing as enum ('unfurnished', 'semi_furnished', 'fully_furnished');

create type public.listing_status as enum ('draft', 'pending_review', 'published', 'paused', 'rejected', 'archived');
comment on type public.listing_status is 'properties.status. Only "published" is publicly visible. Transitions are enforced by the trigger properties_lifecycle (see 20261111000207).';

create type public.availability_status as enum ('available', 'limited', 'fully_occupied', 'coming_soon', 'unavailable');

create type public.bed_status as enum ('available', 'reserved', 'occupied', 'blocked');

create type public.room_type as enum ('private', 'shared');

create type public.utility_billing as enum ('included', 'fixed', 'metered');

create type public.inquiry_status as enum ('new', 'responded', 'closed', 'spam');

create type public.owner_type as enum ('individual', 'pg_operator', 'agent', 'company');

create type public.charge_frequency as enum ('monthly', 'one_time', 'yearly');

create type public.media_kind as enum ('image', 'video');

create type public.review_status as enum ('published', 'hidden', 'removed');

create type public.property_verification_kind as enum ('authorisation', 'listing_confirmation', 'site_visit');

create type public.verification_kind as enum (
  'government_id', 'ownership_proof', 'authorisation_letter', 'utility_bill', 'business_registration'
);

create type public.place_kind as enum (
  'college', 'university', 'office', 'tech_park', 'metro_station', 'railway_station', 'airport',
  'bus_stop', 'hospital', 'pharmacy', 'restaurant', 'cafe', 'grocery', 'shopping_centre', 'gym'
);

-- user_preferences.property_types was text[] in stage 1 because this enum did not exist yet.
-- Convert it now so only real property types can be stored. The old size/length CHECK is replaced
-- by one that fits an enum array; the column-level UPDATE grant from stage 1 is unaffected.
alter table public.user_preferences drop constraint user_preferences_property_types_size;
alter table public.user_preferences alter column property_types drop default;
alter table public.user_preferences
  alter column property_types type public.property_type[]
  using property_types::public.property_type[];
alter table public.user_preferences alter column property_types set default '{}';
alter table public.user_preferences add constraint user_preferences_property_types_size check (
  cardinality(property_types) <= 12 and array_position(property_types, null) is null
);
comment on column public.user_preferences.property_types is 'Preferred property types (property_type enum values), at most 12.';
