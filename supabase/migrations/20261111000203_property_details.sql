-- ZUVIO stage 2 / 03 — what describes a listing: amenities, media, rules, extra charges and the
-- property's own availability statement. Triggers in 20261111000206, policies in 20261111000208.

-- ───────────────────────────── property_amenities ─────────────────────────────
create table public.property_amenities (
  property_id  uuid not null references public.properties (id) on delete cascade,
  amenity_code text not null references public.amenities (code) on update cascade on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (property_id, amenity_code)
);
comment on table public.property_amenities is 'Amenities an owner selected for a property. Mirrored into properties.amenity_codes by trigger.';

create index property_amenities_amenity_idx on public.property_amenities (amenity_code);

alter table public.property_amenities enable row level security;

-- ───────────────────────────── property_media ─────────────────────────────
create table public.property_media (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  room_id      uuid,
  storage_path text not null,
  kind         public.media_kind not null default 'image',
  alt_text     text,
  width        integer,
  height       integer,
  size_bytes   bigint,
  position     smallint not null default 0,
  is_cover     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- a photo may be tied to a room of the SAME property; deleting the room keeps the photo
  constraint property_media_room_property_fkey foreign key (room_id, property_id)
    references public.rooms (id, property_id) on delete set null (room_id),
  constraint property_media_storage_path_key unique (storage_path),
  -- objects live in the property's own folder of the property-media bucket: "<property_id>/<file>"
  constraint property_media_storage_path_own_folder check (
    char_length(storage_path) <= 300
    and storage_path like property_id::text || '/%'
    and char_length(storage_path) > char_length(property_id::text) + 1
    and storage_path !~ '(\.\.|//|[\u0001-\u001F])'
  ),
  constraint property_media_alt_text_length check (alt_text is null or char_length(alt_text) <= 200),
  constraint property_media_dimensions check ((width is null or width between 1 and 20000) and (height is null or height between 1 and 20000)),
  constraint property_media_size_range check (size_bytes is null or size_bytes between 1 and 104857600),
  constraint property_media_position_range check (position >= 0),
  constraint property_media_cover_is_image check (not is_cover or kind = 'image')
);
comment on table public.property_media is 'Photos / videos of a property (optionally of one of its rooms). storage_path is the object path inside the public "property-media" bucket and must start with "<property_id>/". At most one row per property has is_cover (setting it on one row clears the others). At most 40 rows per property.';

create index property_media_property_idx on public.property_media (property_id, position);
create index property_media_room_idx on public.property_media (room_id) where room_id is not null;
-- "at most one cover per property" as a constraint; the trigger makes switching covers painless
create unique index property_media_one_cover_idx on public.property_media (property_id) where is_cover;

create trigger property_media_set_updated_at before update on public.property_media
  for each row execute function public.set_updated_at();

alter table public.property_media enable row level security;

-- ───────────────────────────── property_rules ─────────────────────────────
create table public.property_rules (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  rule_code   text not null,
  allowed     boolean,
  value       text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint property_rules_property_code_key unique (property_id, rule_code),
  constraint property_rules_code_format check (rule_code ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint property_rules_value_length check (value is null or char_length(value) between 1 and 80),
  constraint property_rules_note_length check (note is null or char_length(note) between 1 and 300),
  constraint property_rules_has_content check (allowed is not null or value is not null or note is not null)
);
comment on table public.property_rules is 'House rules, one row per rule_code per property. allowed answers yes/no rules (smoking, drinking, pets, visitors, overnight_guests, non_veg_food, couples, loud_music); value carries a detail such as a gate closing time (rule_code gate_closing_time, value "22:30"); note is free text. The UI owns the catalogue of codes; at most 40 rows per property.';

alter table public.property_rules enable row level security;

create trigger property_rules_set_updated_at before update on public.property_rules
  for each row execute function public.set_updated_at();

-- ───────────────────────────── property_charges ─────────────────────────────
create table public.property_charges (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  label        text not null,
  amount       integer not null,
  frequency    public.charge_frequency not null default 'monthly',
  is_mandatory boolean not null default true,
  position     smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint property_charges_label_length check (char_length(label) between 2 and 80 and label = btrim(label)),
  constraint property_charges_amount_range check (amount between 0 and 10000000),
  constraint property_charges_position_range check (position >= 0)
);
comment on table public.property_charges is 'Additional costs of a property beyond rent, maintenance, utilities and food (e.g. "Laundry", "Registration fee"). Mandatory monthly charges are part of the estimated monthly expense; one_time charges are move-in cost. Integer INR; at most 20 rows per property.';

create index property_charges_property_idx on public.property_charges (property_id, position);

create trigger property_charges_set_updated_at before update on public.property_charges
  for each row execute function public.set_updated_at();

alter table public.property_charges enable row level security;

-- ───────────────────────────── property_availability ─────────────────────────────
create table public.property_availability (
  property_id        uuid primary key references public.properties (id) on delete cascade,
  status             public.availability_status not null default 'unavailable',
  available_from     date,
  min_stay_months    smallint,
  notice_period_days smallint,
  last_confirmed_at  timestamptz,
  confirmed_by       uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint property_availability_available_from_range check (available_from is null or available_from between date '2020-01-01' and date '2100-01-01'),
  constraint property_availability_min_stay_range check (min_stay_months is null or min_stay_months between 0 and 60),
  constraint property_availability_notice_range check (notice_period_days is null or notice_period_days between 0 and 365)
);
comment on table public.property_availability is 'The property''s own availability statement, one row per property (created by trigger with the property). entire_unit listings: the owner sets status and available_from (initially "available"). per_bed listings: status and available_from are DERIVED from bed statuses by trigger and cannot be set by the owner — no beds: unavailable; no available bed: fully_occupied (unavailable when every bed is blocked); every available bed frees up later: coming_soon with the earliest date; at most a quarter of the beds available: limited; otherwise available. Bed counts are always shown separately (properties.available_beds / total_beds). last_confirmed_at / confirmed_by are stamped by confirm_listing().';
comment on column public.property_availability.status is 'For per_bed listings "coming_soon" is evaluated when beds change, so it can lag once the date passes; search must judge move-in dates on beds.available_from, not on this column.';

create index property_availability_confirmed_by_idx on public.property_availability (confirmed_by) where confirmed_by is not null;

create trigger property_availability_set_updated_at before update on public.property_availability
  for each row execute function public.set_updated_at();

alter table public.property_availability enable row level security;
