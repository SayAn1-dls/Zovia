-- ZUVIO stage 1 / 03 — user tables (spec 6.1). Rows are created by the auth trigger in file 08;
-- policies and grants are in file 07. RLS is enabled here so no table ever exists without it.
-- RLS is deliberately NOT forced: SECURITY DEFINER functions owned by postgres must cross it.

-- Shared trigger function: keeps updated_at honest whatever the client sends.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
revoke all on function public.set_updated_at() from public, anon, authenticated;
comment on function public.set_updated_at() is 'BEFORE UPDATE trigger: sets updated_at = now(). Attach to every table that has updated_at.';

-- Internal: turns untrusted text into a safe display name, or NULL when nothing usable is left.
-- Strips control and invisible/bidi formatting characters, collapses whitespace, trims, caps at 60.
create function public.clean_display_name(p_raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    btrim(left(btrim(
      regexp_replace(
        regexp_replace(coalesce(p_raw, ''), '[\u0001-\u001F\u007F-\u009F​-‏ -‮⁠-⁩﻿]', ' ', 'g'),
        '\s+', ' ', 'g')
    ), 60)),
    '')
$$;
revoke all on function public.clean_display_name(text) from public, anon, authenticated;
comment on function public.clean_display_name(text) is 'Internal: sanitises a display name taken from untrusted input (sign-up metadata). Returns NULL when empty.';

-- ───────────────────────────── users ─────────────────────────────
create table public.users (
  id                      uuid primary key references auth.users (id) on delete cascade,
  email                   extensions.citext,
  phone                   text,
  phone_verified_at       timestamptz,
  date_of_birth           date,
  status                  public.account_status not null default 'active',
  intent                  public.user_intent,
  onboarding_completed_at timestamptz,
  last_seen_at            timestamptz,
  deleted_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint users_email_length check (email is null or char_length(email::text) <= 255),
  constraint users_phone_length check (phone is null or char_length(phone) between 5 and 20),
  constraint users_date_of_birth_range check (date_of_birth is null or (date_of_birth >= date '1900-01-01' and date_of_birth <= current_date)),
  constraint users_deleted_consistent check ((status = 'deleted') = (deleted_at is not null))
);
comment on table public.users is 'Private account row, 1:1 with auth.users (same id), created by trigger at sign-up. Readable by its owner and staff only. email/phone mirror auth.users; status is changed only by moderation/account functions.';
comment on column public.users.status is 'active | restricted | suspended | deleted. Never writable by the user.';
comment on column public.users.email is 'Mirror of auth.users.email (kept in sync by trigger). Not unique here: Auth owns uniqueness.';

create index users_email_idx on public.users (email);
create index users_phone_idx on public.users (phone) where phone is not null;
create index users_status_idx on public.users (status) where status <> 'active';
create index users_created_at_idx on public.users (created_at desc);

create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();

alter table public.users enable row level security;

-- ───────────────────────────── user_profiles ─────────────────────────────
create table public.user_profiles (
  user_id       uuid primary key references public.users (id) on delete cascade,
  display_name  text not null default 'New member',
  avatar_path   text,
  gender        public.gender,
  occupation    public.occupation_type,
  college_name  text,
  course        text,
  academic_year smallint,
  work_location text,
  company       text,
  industry      text,
  work_schedule public.work_schedule,
  home_city     text,
  bio           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint user_profiles_display_name_valid check (
    char_length(display_name) between 1 and 60
    and display_name = btrim(display_name)
    and display_name !~ '[\u0001-\u001F\u007F-\u009F​-‏ -‮⁠-⁩﻿]'
  ),
  -- an avatar always lives in the user's own folder of the avatars bucket: "<user_id>/<file>"
  constraint user_profiles_avatar_path_own_folder check (
    avatar_path is null
    or (char_length(avatar_path) <= 300
        and avatar_path like user_id::text || '/%'
        and avatar_path !~ '(\.\.|//|[\u0001-\u001F])')
  ),
  constraint user_profiles_college_name_length check (college_name is null or char_length(college_name) between 1 and 120),
  constraint user_profiles_course_length check (course is null or char_length(course) between 1 and 120),
  constraint user_profiles_academic_year_range check (academic_year is null or academic_year between 1 and 8),
  constraint user_profiles_work_location_length check (work_location is null or char_length(work_location) between 1 and 120),
  constraint user_profiles_company_length check (company is null or char_length(company) between 1 and 120),
  constraint user_profiles_industry_length check (industry is null or char_length(industry) between 1 and 80),
  constraint user_profiles_home_city_length check (home_city is null or char_length(home_city) between 1 and 80),
  constraint user_profiles_bio_length check (bio is null or char_length(bio) <= 500)
);
comment on table public.user_profiles is 'Profile details of a user (1:1 with users). Readable by self and staff; the messaging stage adds "people who share a conversation". Other users only ever see the public_user_cards view.';
comment on column public.user_profiles.avatar_path is 'Object path inside the public "avatars" bucket; must start with "<user_id>/".';
comment on column public.user_profiles.academic_year is 'Year of study, 1..8.';

create trigger user_profiles_set_updated_at before update on public.user_profiles
  for each row execute function public.set_updated_at();

alter table public.user_profiles enable row level security;

-- ───────────────────────────── user_preferences ─────────────────────────────
create table public.user_preferences (
  user_id              uuid primary key references public.users (id) on delete cascade,
  preferred_city       text,
  preferred_localities text[] not null default '{}',
  budget_min           integer,
  budget_max           integer,
  move_in_date         date,
  -- values of the property_type enum, which the marketplace stage creates; kept as text[] here
  property_types       text[] not null default '{}',
  occupancy_prefs      smallint[] not null default '{}',
  email_notifications  boolean not null default true,
  marketing_opt_in     boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint user_preferences_city_length check (preferred_city is null or char_length(preferred_city) between 1 and 80),
  constraint user_preferences_localities_size check (
    cardinality(preferred_localities) <= 10
    and array_position(preferred_localities, null) is null
    and char_length(array_to_string(preferred_localities, '')) <= 800
  ),
  constraint user_preferences_budget_min_range check (budget_min is null or budget_min between 0 and 10000000),
  constraint user_preferences_budget_max_range check (budget_max is null or budget_max between 0 and 10000000),
  constraint user_preferences_budget_order check (budget_min is null or budget_max is null or budget_min <= budget_max),
  constraint user_preferences_property_types_size check (
    cardinality(property_types) <= 20
    and array_position(property_types, null) is null
    and char_length(array_to_string(property_types, '')) <= 600
  ),
  constraint user_preferences_occupancy_range check (
    cardinality(occupancy_prefs) <= 12
    and occupancy_prefs <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]
  )
);
comment on table public.user_preferences is 'Search and notification preferences of a user (1:1 with users). Private to its owner (+ staff read). Budgets are integer INR per month.';
comment on column public.user_preferences.occupancy_prefs is 'Preferred sharing sizes (1 = private room, 2 = double sharing ...), each 1..12.';

create trigger user_preferences_set_updated_at before update on public.user_preferences
  for each row execute function public.set_updated_at();

alter table public.user_preferences enable row level security;

-- ───────────────────────────── user_roles ─────────────────────────────
create table public.user_roles (
  user_id    uuid not null references public.users (id) on delete cascade,
  role       public.user_role not null,
  granted_by uuid references public.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
comment on table public.user_roles is 'Roles of a user. The ONLY source of truth for roles (never JWT metadata). No client writes: rows come from the sign-up trigger (seeker), become_owner(), admin_set_role() and scripts/grant-admin.sql.';

create index user_roles_role_idx on public.user_roles (role);
create index user_roles_granted_by_idx on public.user_roles (granted_by) where granted_by is not null;

alter table public.user_roles enable row level security;

-- ───────────────────────────── user_blocks ─────────────────────────────
create table public.user_blocks (
  blocker_id uuid not null references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);
comment on table public.user_blocks is 'blocker_id has blocked blocked_id. A user sees only the blocks they created; writes go through block_user()/unblock_user() (messaging stage).';

create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

-- ───────────────────────────── user_restrictions ─────────────────────────────
create table public.user_restrictions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users (id) on delete cascade,
  kind                 public.restriction_kind not null,
  reason               text not null,
  -- link to moderation_actions; the moderation stage creates that table and adds the foreign key
  moderation_action_id uuid,
  starts_at            timestamptz not null default now(),
  ends_at              timestamptz,
  lifted_at            timestamptz,
  lifted_by            uuid references public.users (id) on delete set null,
  created_by           uuid references public.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  constraint user_restrictions_reason_length check (char_length(reason) between 1 and 500),
  constraint user_restrictions_period check (ends_at is null or ends_at > starts_at)
);
comment on table public.user_restrictions is 'Scoped restrictions on a user (messaging | matching | listing | all). Active = lifted_at is null and now() within [starts_at, ends_at); ends_at null = until lifted. created_by null = created by the system. Written only by moderation functions.';

create index user_restrictions_user_active_idx on public.user_restrictions (user_id, kind) where lifted_at is null;
create index user_restrictions_moderation_action_idx on public.user_restrictions (moderation_action_id) where moderation_action_id is not null;
create index user_restrictions_lifted_by_idx on public.user_restrictions (lifted_by) where lifted_by is not null;
create index user_restrictions_created_by_idx on public.user_restrictions (created_by) where created_by is not null;

alter table public.user_restrictions enable row level security;

-- ───────────────────────────── user_violations ─────────────────────────────
create table public.user_violations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  kind            public.violation_kind not null,
  -- link to conversations; the messaging stage creates that table and adds the foreign key
  conversation_id uuid,
  detected        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  constraint user_violations_detected_object check (jsonb_typeof(detected) = 'object')
);
comment on table public.user_violations is 'Automatically detected rule violations (e.g. sharing contact details in a roommate chat). "detected" holds the kinds found, never the offending text. Written only by functions.';

create index user_violations_user_kind_created_idx on public.user_violations (user_id, kind, created_at desc);
create index user_violations_conversation_idx on public.user_violations (conversation_id) where conversation_id is not null;

alter table public.user_violations enable row level security;
