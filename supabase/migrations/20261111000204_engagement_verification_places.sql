-- ZUVIO stage 2 / 04 — what seekers do with listings (save, enquire, reveal contact), listing
-- statistics, verification, and nearby places. Policies and grants in 20261111000208.

-- ───────────────────────────── saved_properties ─────────────────────────────
create table public.saved_properties (
  user_id     uuid not null references public.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, property_id)
);
comment on table public.saved_properties is 'A user''s saved (shortlisted) listings. Own rows only; a listing can be saved only while it is published.';

create index saved_properties_property_idx on public.saved_properties (property_id);
create index saved_properties_user_created_idx on public.saved_properties (user_id, created_at desc);

alter table public.saved_properties enable row level security;

-- ───────────────────────────── property_inquiries ─────────────────────────────
create table public.property_inquiries (
  id                 uuid primary key default gen_random_uuid(),
  property_id        uuid not null references public.properties (id) on delete cascade,
  seeker_id          uuid not null references public.users (id) on delete cascade,
  room_id            uuid,
  bed_id             uuid,
  message            text not null,
  move_in_date       date,
  occupants          smallint not null default 1,
  status             public.inquiry_status not null default 'new',
  -- link to conversations; the messaging stage creates that table and adds the foreign key
  conversation_id    uuid,
  owner_responded_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- an enquiry may name a room / bed of the SAME property; removing them keeps the enquiry
  constraint property_inquiries_room_property_fkey foreign key (room_id, property_id)
    references public.rooms (id, property_id) on delete set null (room_id),
  constraint property_inquiries_bed_property_fkey foreign key (bed_id, property_id)
    references public.beds (id, property_id) on delete set null (bed_id),
  constraint property_inquiries_message_length check (char_length(message) between 1 and 2000),
  constraint property_inquiries_occupants_range check (occupants between 1 and 12),
  constraint property_inquiries_move_in_range check (move_in_date is null or move_in_date between date '2020-01-01' and date '2100-01-01')
);
comment on table public.property_inquiries is 'An enquiry from a seeker about a property (never a booking). Readable by the seeker and the property''s owner (+ staff). No client writes: created by create_inquiry() and moved by update_inquiry_status() (messaging stage), which also open the enquiry conversation.';
comment on column public.property_inquiries.status is 'new | responded (owner replied) | closed | spam (owner''s judgement; does not remove the seeker''s right to review).';

-- "at most one open enquiry per seeker per property": the constraint create_inquiry() relies on
-- under concurrent calls (the second insert fails with 23505 instead of creating a duplicate).
create unique index property_inquiries_one_open_idx on public.property_inquiries (seeker_id, property_id)
  where status in ('new', 'responded');
create index property_inquiries_property_idx on public.property_inquiries (property_id, created_at desc);
create index property_inquiries_seeker_idx on public.property_inquiries (seeker_id, property_id);
create index property_inquiries_room_idx on public.property_inquiries (room_id) where room_id is not null;
create index property_inquiries_bed_idx on public.property_inquiries (bed_id) where bed_id is not null;
create index property_inquiries_conversation_idx on public.property_inquiries (conversation_id) where conversation_id is not null;

create trigger property_inquiries_set_updated_at before update on public.property_inquiries
  for each row execute function public.set_updated_at();

alter table public.property_inquiries enable row level security;

-- ───────────────────────────── contact_reveals ─────────────────────────────
create table public.contact_reveals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_at  timestamptz not null default now()
);
comment on table public.contact_reveals is 'Log of owner-contact reveals: who asked for which listing''s contact details and when. Written only by reveal_owner_contact(); a user reads their own rows, staff read all.';

create index contact_reveals_user_created_idx on public.contact_reveals (user_id, created_at desc);
create index contact_reveals_property_idx on public.contact_reveals (property_id, created_at desc);

alter table public.contact_reveals enable row level security;

-- ───────────────────────────── property_stats_daily ─────────────────────────────
create table public.property_stats_daily (
  property_id     uuid not null references public.properties (id) on delete cascade,
  day             date not null,
  views           integer not null default 0,
  saves           integer not null default 0,
  inquiries       integer not null default 0,
  contact_reveals integer not null default 0,
  primary key (property_id, day),
  constraint property_stats_daily_non_negative check (views >= 0 and saves >= 0 and inquiries >= 0 and contact_reveals >= 0)
);
comment on table public.property_stats_daily is 'Per-listing daily counters (views, saves, enquiries, contact reveals) for the owner''s performance page. One row per property per day (IST date); incremented only by functions with INSERT ... ON CONFLICT (property_id, day) DO UPDATE, which is safe under concurrency. The owner reads their own listings'' rows, staff read all.';

create index property_stats_daily_day_idx on public.property_stats_daily (day);

alter table public.property_stats_daily enable row level security;

-- ───────────────────────────── verification_records ─────────────────────────────
create table public.verification_records (
  id            uuid primary key default gen_random_uuid(),
  subject_type  text not null,
  subject_id    uuid not null,
  submitted_by  uuid not null references public.users (id) on delete cascade,
  kind          public.verification_kind not null,
  document_path text not null,
  status        public.verification_status not null default 'pending',
  reviewed_by   uuid references public.users (id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint verification_records_subject_type_valid check (subject_type in ('owner', 'property')),
  -- an owner subject is always the submitter themselves
  constraint verification_records_owner_subject_is_submitter check (subject_type <> 'owner' or subject_id = submitted_by),
  -- documents live in the submitter's own folder of the private bucket: "<user_id>/<file>"
  constraint verification_records_document_path_own_folder check (
    char_length(document_path) <= 300
    and document_path like submitted_by::text || '/%'
    and char_length(document_path) > char_length(submitted_by::text) + 1
    and document_path !~ '(\.\.|//|[\u0001-\u001F])'
  ),
  constraint verification_records_document_path_key unique (document_path),
  constraint verification_records_status_valid check (status in ('pending', 'verified', 'rejected', 'expired')),
  constraint verification_records_review_note_length check (review_note is null or char_length(review_note) <= 1000),
  constraint verification_records_reviewed_consistent check ((status = 'pending') = (reviewed_at is null))
);
comment on table public.verification_records is 'A document submitted for staff review: about the owner (subject_type owner, subject_id = the owner''s user id) or about one of their properties (subject_type property). document_path is the object path in the private "verification-documents" bucket, inside the submitter''s folder. The submitter may insert and read their own rows; staff read all; status / review fields change only through admin_review_verification(). review_note is shown to the submitter.';

-- one pending record per subject and kind keeps the review queue free of duplicates
create unique index verification_records_one_pending_idx on public.verification_records (subject_type, subject_id, kind)
  where status = 'pending';
create index verification_records_subject_idx on public.verification_records (subject_type, subject_id);
create index verification_records_submitted_by_idx on public.verification_records (submitted_by, created_at desc);
create index verification_records_queue_idx on public.verification_records (created_at) where status = 'pending';
create index verification_records_reviewed_by_idx on public.verification_records (reviewed_by) where reviewed_by is not null;

create trigger verification_records_set_updated_at before update on public.verification_records
  for each row execute function public.set_updated_at();

alter table public.verification_records enable row level security;

-- ───────────────────────────── property_verifications ─────────────────────────────
create table public.property_verifications (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  kind        public.property_verification_kind not null,
  status      public.verification_status not null default 'unverified',
  verified_at timestamptz,
  verified_by uuid references public.users (id) on delete set null,
  expires_at  timestamptz,
  record_id   uuid references public.verification_records (id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint property_verifications_property_kind_key unique (property_id, kind),
  constraint property_verifications_notes_length check (notes is null or char_length(notes) <= 500),
  constraint property_verifications_verified_consistent check (status <> 'verified' or verified_at is not null),
  constraint property_verifications_expiry_order check (expires_at is null or verified_at is null or expires_at > verified_at)
);
comment on table public.property_verifications is 'Per-property trust signals, at most one row per kind: authorisation (staff confirmed the lister may let this property — "Property authorisation verified"), listing_confirmation (owner re-confirmed, written by confirm_listing()), site_visit. Kept separate from owner verification on purpose. Readable wherever the property is readable; no client writes.';
comment on column public.property_verifications.notes is 'Visible to everyone who can see the listing: public-safe wording only. Internal remarks belong in verification_records.review_note or the audit log.';

create index property_verifications_verified_by_idx on public.property_verifications (verified_by) where verified_by is not null;
create index property_verifications_record_idx on public.property_verifications (record_id) where record_id is not null;

create trigger property_verifications_set_updated_at before update on public.property_verifications
  for each row execute function public.set_updated_at();

alter table public.property_verifications enable row level security;

-- ───────────────────────────── places ─────────────────────────────
create table public.places (
  id         uuid primary key default gen_random_uuid(),
  kind       public.place_kind not null,
  name       text not null,
  city       text,
  location   extensions.geography(Point, 4326) not null,
  source     text not null,
  source_ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint places_name_length check (char_length(name) between 1 and 200),
  constraint places_city_length check (city is null or char_length(city) between 2 and 80),
  constraint places_source_format check (source ~ '^[a-z][a-z0-9_]{1,29}$'),
  constraint places_source_ref_length check (char_length(source_ref) between 1 and 200),
  constraint places_source_key unique (source, source_ref)
);
comment on table public.places is 'Real points of interest (colleges, offices, metro stations ...) fetched from a location provider. source names the provider (e.g. google, osm) and source_ref its id there; upsert on (source, source_ref). Public read; written only by the trusted server path (service_role).';

create index places_location_idx on public.places using gist (location);
create index places_kind_city_idx on public.places (kind, lower(city));
create index places_name_trgm_idx on public.places using gin (name extensions.gin_trgm_ops);

create trigger places_set_updated_at before update on public.places
  for each row execute function public.set_updated_at();

alter table public.places enable row level security;

-- ───────────────────────────── property_nearby_places ─────────────────────────────
create table public.property_nearby_places (
  property_id      uuid not null references public.properties (id) on delete cascade,
  place_id         uuid not null references public.places (id) on delete cascade,
  straight_line_m  integer not null,
  route_distance_m integer,
  travel_time_s    integer,
  travel_mode      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (property_id, place_id),
  constraint property_nearby_places_straight_range check (straight_line_m between 0 and 200000),
  constraint property_nearby_places_route_range check (route_distance_m is null or route_distance_m between 0 and 500000),
  constraint property_nearby_places_time_range check (travel_time_s is null or travel_time_s between 0 and 86400),
  constraint property_nearby_places_mode_valid check (travel_mode is null or travel_mode in ('walking', 'two_wheeler', 'driving', 'transit')),
  constraint property_nearby_places_route_complete check ((route_distance_m is null and travel_time_s is null and travel_mode is null) or travel_mode is not null)
);
comment on table public.property_nearby_places is 'Places near a property with the straight-line distance (always) and, only when a routing provider supplied them, route distance / travel time / mode. Readable wherever the property is readable; written only by the trusted server path (service_role).';

create index property_nearby_places_place_idx on public.property_nearby_places (place_id);
create index property_nearby_places_distance_idx on public.property_nearby_places (property_id, straight_line_m);

create trigger property_nearby_places_set_updated_at before update on public.property_nearby_places
  for each row execute function public.set_updated_at();

alter table public.property_nearby_places enable row level security;
