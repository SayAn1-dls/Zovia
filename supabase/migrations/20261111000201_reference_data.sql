-- ZUVIO stage 2 / 01 — marketplace reference data: cities and amenities.
-- Reference rows are inserted here with ON CONFLICT DO NOTHING (never demo listings).
-- Policies and grants are in 20261111000208.

-- ───────────────────────────── cities ─────────────────────────────
create table public.cities (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null,
  name       text not null,
  state      text not null,
  location   extensions.geography(Point, 4326) not null,
  position   smallint not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cities_slug_format check (slug ~ '^[a-z][a-z0-9-]{1,59}$'),
  constraint cities_name_length check (char_length(name) between 2 and 80),
  constraint cities_state_length check (char_length(state) between 2 and 60),
  constraint cities_slug_key unique (slug),
  constraint cities_name_key unique (name)
);
comment on table public.cities is 'Reference data: cities ZUVIO serves (city shortcuts, search defaults, map centre). Public read; changed only by migrations or the trusted server. properties.city is free text matched case-insensitively, not a foreign key.';
comment on column public.cities.location is 'City centre, geography(Point, 4326): longitude first in ST_MakePoint.';

create index cities_location_idx on public.cities using gist (location);

create trigger cities_set_updated_at before update on public.cities
  for each row execute function public.set_updated_at();

alter table public.cities enable row level security;

insert into public.cities (slug, name, state, location, position) values
  ('bengaluru',  'Bengaluru',  'Karnataka',      extensions.st_setsrid(extensions.st_makepoint(77.5946, 12.9716), 4326)::extensions.geography,  1),
  ('mumbai',     'Mumbai',     'Maharashtra',    extensions.st_setsrid(extensions.st_makepoint(72.8777, 19.0760), 4326)::extensions.geography,  2),
  ('delhi',      'Delhi',      'Delhi',          extensions.st_setsrid(extensions.st_makepoint(77.2090, 28.6139), 4326)::extensions.geography,  3),
  ('gurugram',   'Gurugram',   'Haryana',        extensions.st_setsrid(extensions.st_makepoint(77.0266, 28.4595), 4326)::extensions.geography,  4),
  ('noida',      'Noida',      'Uttar Pradesh',  extensions.st_setsrid(extensions.st_makepoint(77.3910, 28.5355), 4326)::extensions.geography,  5),
  ('pune',       'Pune',       'Maharashtra',    extensions.st_setsrid(extensions.st_makepoint(73.8567, 18.5204), 4326)::extensions.geography,  6),
  ('hyderabad',  'Hyderabad',  'Telangana',      extensions.st_setsrid(extensions.st_makepoint(78.4867, 17.3850), 4326)::extensions.geography,  7),
  ('chennai',    'Chennai',    'Tamil Nadu',     extensions.st_setsrid(extensions.st_makepoint(80.2707, 13.0827), 4326)::extensions.geography,  8),
  ('kolkata',    'Kolkata',    'West Bengal',    extensions.st_setsrid(extensions.st_makepoint(88.3639, 22.5726), 4326)::extensions.geography,  9),
  ('ahmedabad',  'Ahmedabad',  'Gujarat',        extensions.st_setsrid(extensions.st_makepoint(72.5714, 23.0225), 4326)::extensions.geography, 10),
  ('jaipur',     'Jaipur',     'Rajasthan',      extensions.st_setsrid(extensions.st_makepoint(75.7873, 26.9124), 4326)::extensions.geography, 11),
  ('chandigarh', 'Chandigarh', 'Chandigarh',     extensions.st_setsrid(extensions.st_makepoint(76.7794, 30.7333), 4326)::extensions.geography, 12),
  ('indore',     'Indore',     'Madhya Pradesh', extensions.st_setsrid(extensions.st_makepoint(75.8577, 22.7196), 4326)::extensions.geography, 13),
  ('kota',       'Kota',       'Rajasthan',      extensions.st_setsrid(extensions.st_makepoint(75.8648, 25.2138), 4326)::extensions.geography, 14),
  ('sonipat',    'Sonipat',    'Haryana',        extensions.st_setsrid(extensions.st_makepoint(77.0151, 28.9931), 4326)::extensions.geography, 15)
on conflict do nothing;

-- ───────────────────────────── amenities ─────────────────────────────
create table public.amenities (
  code       text primary key,
  name       text not null,
  category   text not null,
  icon       text not null,
  position   smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint amenities_code_format check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint amenities_name_length check (char_length(name) between 2 and 60),
  constraint amenities_category_valid check (category in ('essentials', 'comfort', 'room', 'services', 'safety', 'common')),
  constraint amenities_icon_format check (icon ~ '^[a-z][a-z0-9-]{1,49}$')
);
comment on table public.amenities is 'Reference data: amenity catalogue (code is the stable key used in property_amenities and properties.amenity_codes). icon is a lucide icon name. Public read; changed only by migrations.';

alter table public.amenities enable row level security;

insert into public.amenities (code, name, category, icon, position) values
  ('wifi',                'Wi-Fi',               'essentials', 'wifi',             1),
  ('power_backup',        'Power backup',        'essentials', 'battery-charging', 2),
  ('water_purifier',      'Water purifier',      'essentials', 'droplets',         3),
  ('hot_water',           'Hot water',           'essentials', 'shower-head',      4),
  ('ac',                  'Air conditioning',    'comfort',    'air-vent',         5),
  ('geyser',              'Geyser',              'comfort',    'heater',           6),
  ('fridge',              'Fridge',              'comfort',    'refrigerator',     7),
  ('washing_machine',     'Washing machine',     'comfort',    'washing-machine',  8),
  ('tv',                  'TV',                  'comfort',    'tv',               9),
  ('attached_bathroom',   'Attached bathroom',   'room',       'bath',            10),
  ('study_table',         'Study table',         'room',       'lamp-desk',       11),
  ('wardrobe',            'Wardrobe',            'room',       'door-closed',     12),
  ('balcony',             'Balcony',             'room',       'fence',           13),
  ('food',                'Meals',               'services',   'utensils',        14),
  ('laundry',             'Laundry',             'services',   'shirt',           15),
  ('housekeeping',        'Housekeeping',        'services',   'spray-can',       16),
  ('cctv',                'CCTV',                'safety',     'cctv',            17),
  ('security_guard',      'Security guard',      'safety',     'shield-check',    18),
  ('kitchen',             'Kitchen',             'common',     'cooking-pot',     19),
  ('common_area',         'Common area',         'common',     'sofa',            20),
  ('gym',                 'Gym',                 'common',     'dumbbell',        21),
  ('lift',                'Lift',                'common',     'arrow-up-down',   22),
  ('parking',             'Car parking',         'common',     'car',             23),
  ('two_wheeler_parking', 'Two-wheeler parking', 'common',     'bike',            24)
on conflict (code) do nothing;
