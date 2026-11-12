-- ZUVIO stage 4 / 00 — roommate matching tables (spec 6.3) and the social enums used by the
-- messaging and moderation stages. Policies and grants are in 20261112000403.
-- RLS is enabled next to every CREATE TABLE so no table ever exists without it.

-- ───────────────────────────── enums ─────────────────────────────
create type public.roommate_profile_status as enum ('draft', 'active', 'paused');
create type public.swipe_action as enum ('like', 'pass');
create type public.match_status as enum ('active', 'unmatched', 'blocked');
create type public.conversation_kind as enum ('roommate_match', 'property_inquiry');
create type public.conversation_status as enum ('active', 'closed');
create type public.message_kind as enum ('text', 'image', 'system');
create type public.message_moderation as enum ('clean', 'flagged', 'blocked');
create type public.report_target as enum ('user', 'property', 'roommate_profile', 'review', 'message');
create type public.report_status as enum ('open', 'in_review', 'resolved', 'dismissed');
create type public.moderation_action_kind as enum ('warning', 'restrict', 'suspend', 'unsuspend', 'lift_restriction', 'content_removed');
create type public.appeal_status as enum ('pending', 'upheld', 'overturned');

-- ───────────────────────────── lifestyle_questions (reference data) ─────────────────────────────
create table public.lifestyle_questions (
  code       text primary key,
  factor     text not null,
  prompt     text not null,
  kind       text not null,
  options    jsonb not null,
  position   smallint not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lifestyle_questions_code_format check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint lifestyle_questions_factor_valid check (factor in ('budget', 'cleanliness', 'sleep', 'food', 'smoking_drinking', 'lifestyle', 'schedule', 'guests', 'location')),
  constraint lifestyle_questions_prompt_length check (char_length(prompt) between 3 and 140),
  constraint lifestyle_questions_kind_valid check (kind in ('scale', 'choice')),
  constraint lifestyle_questions_options_array check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 10)
);
comment on table public.lifestyle_questions is 'Reference data: the roommate questionnaire. options = [{value, label}] with values 1..n. Codes, factors and option values MUST match src/features/roommates/compatibility/questions.ts.';

create trigger lifestyle_questions_set_updated_at before update on public.lifestyle_questions
  for each row execute function public.set_updated_at();

alter table public.lifestyle_questions enable row level security;

insert into public.lifestyle_questions (code, factor, prompt, kind, position, options) values
  ('food_habit', 'food', 'What do you eat?', 'choice', 1,
   '[{"value":1,"label":"Vegetarian"},{"value":2,"label":"Eggetarian"},{"value":3,"label":"Non-vegetarian"},{"value":4,"label":"Vegan"}]'),
  ('kitchen_preference', 'food', 'What is okay in a shared kitchen?', 'choice', 2,
   '[{"value":1,"label":"Veg-only kitchen please"},{"value":2,"label":"Eggs are fine"},{"value":3,"label":"Anything goes"}]'),
  ('smoking', 'smoking_drinking', 'Do you smoke?', 'choice', 3,
   '[{"value":1,"label":"Never"},{"value":2,"label":"Occasionally, outside only"},{"value":3,"label":"Regularly"}]'),
  ('drinking', 'smoking_drinking', 'Do you drink?', 'choice', 4,
   '[{"value":1,"label":"Never"},{"value":2,"label":"Socially"},{"value":3,"label":"Regularly"}]'),
  ('sleep_schedule', 'sleep', 'When do you usually sleep?', 'scale', 5,
   '[{"value":1,"label":"Early bird (asleep by 10 pm)"},{"value":2,"label":"Before midnight"},{"value":3,"label":"Around midnight"},{"value":4,"label":"After midnight"},{"value":5,"label":"Night owl (after 2 am)"}]'),
  ('cleanliness', 'cleanliness', 'How tidy do you keep shared spaces?', 'scale', 6,
   '[{"value":1,"label":"Very relaxed"},{"value":2,"label":"Relaxed"},{"value":3,"label":"Tidy enough"},{"value":4,"label":"Clean"},{"value":5,"label":"Spotless"}]'),
  ('social_level', 'lifestyle', 'How social are you at home?', 'scale', 7,
   '[{"value":1,"label":"Keep to myself"},{"value":2,"label":"Mostly private"},{"value":3,"label":"Balanced"},{"value":4,"label":"Social"},{"value":5,"label":"Very social"}]'),
  ('noise', 'lifestyle', 'Music and noise at home?', 'scale', 8,
   '[{"value":1,"label":"Need quiet"},{"value":2,"label":"Mostly quiet"},{"value":3,"label":"Some background noise"},{"value":4,"label":"Music often"},{"value":5,"label":"Music out loud"}]'),
  ('pets', 'lifestyle', 'Pets?', 'choice', 9,
   '[{"value":1,"label":"I have a pet"},{"value":2,"label":"Love pets"},{"value":3,"label":"Prefer no pets"},{"value":4,"label":"Allergic to pets"}]'),
  ('cooking', 'lifestyle', 'How often do you cook?', 'scale', 10,
   '[{"value":1,"label":"Never cook"},{"value":2,"label":"Rarely"},{"value":3,"label":"Sometimes"},{"value":4,"label":"Often"},{"value":5,"label":"Cook daily"}]'),
  ('personal_space', 'lifestyle', 'How do you feel about sharing things?', 'scale', 11,
   '[{"value":1,"label":"Very private"},{"value":2,"label":"Private"},{"value":3,"label":"Balanced"},{"value":4,"label":"Open"},{"value":5,"label":"Share everything"}]'),
  ('chores', 'lifestyle', 'How should chores work?', 'choice', 12,
   '[{"value":1,"label":"Split with a schedule"},{"value":2,"label":"Hire help and split the cost"},{"value":3,"label":"Everyone handles their own mess"}]'),
  ('rent_payment', 'lifestyle', 'When do you usually pay rent?', 'choice', 13,
   '[{"value":1,"label":"Always on or before the due date"},{"value":2,"label":"Usually on time"},{"value":3,"label":"Sometimes late"}]'),
  ('schedule', 'schedule', 'What does your work or study day look like?', 'choice', 14,
   '[{"value":1,"label":"Daytime (roughly 9 to 6)"},{"value":2,"label":"Night shift"},{"value":3,"label":"Flexible or hybrid"},{"value":4,"label":"Work or study from home"},{"value":5,"label":"Irregular"}]'),
  ('guests', 'guests', 'How often do you have guests over?', 'scale', 15,
   '[{"value":1,"label":"Never"},{"value":2,"label":"Rarely"},{"value":3,"label":"Sometimes"},{"value":4,"label":"Often"},{"value":5,"label":"Very often"}]'),
  ('overnight_guests', 'guests', 'Overnight guests?', 'choice', 16,
   '[{"value":1,"label":"Not okay"},{"value":2,"label":"Occasionally with notice"},{"value":3,"label":"Fine"}]')
on conflict (code) do nothing;

-- ───────────────────────────── compatibility_weights ─────────────────────────────
create table public.compatibility_weights (
  factor     text primary key,
  weight     numeric(5, 4) not null,
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint compatibility_weights_factor_valid check (factor in ('budget', 'cleanliness', 'sleep', 'food', 'smoking_drinking', 'lifestyle', 'schedule', 'guests', 'location')),
  constraint compatibility_weights_weight_range check (weight between 0 and 1)
);
comment on table public.compatibility_weights is 'Factor weights of the compatibility engine (spec 6.3). Readable by signed-in users; changed only by admin_update_compatibility_weights() (admin stage). Must sum to 1.';

create index compatibility_weights_updated_by_idx on public.compatibility_weights (updated_by) where updated_by is not null;

create trigger compatibility_weights_set_updated_at before update on public.compatibility_weights
  for each row execute function public.set_updated_at();

alter table public.compatibility_weights enable row level security;

insert into public.compatibility_weights (factor, weight) values
  ('budget', 0.20), ('cleanliness', 0.15), ('sleep', 0.15), ('food', 0.10), ('smoking_drinking', 0.10),
  ('lifestyle', 0.10), ('schedule', 0.10), ('guests', 0.05), ('location', 0.05)
on conflict (factor) do nothing;

-- ───────────────────────────── roommate_profiles ─────────────────────────────
create table public.roommate_profiles (
  user_id              uuid primary key references public.users (id) on delete cascade,
  status               public.roommate_profile_status not null default 'draft',
  headline             text,
  about                text,
  age                  smallint,
  gender               public.gender,
  occupation           public.occupation_type,
  occupation_detail    text,
  city                 text,
  preferred_localities text[] not null default '{}',
  location             extensions.geography(Point, 4326),
  budget_min           integer,
  budget_max           integer,
  move_in_date         date,
  has_place            boolean not null default false,
  last_active_at       timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint roommate_profiles_headline_length check (headline is null or char_length(headline) between 3 and 80),
  constraint roommate_profiles_about_length check (about is null or char_length(about) <= 1000),
  constraint roommate_profiles_age_range check (age is null or age between 18 and 99),
  constraint roommate_profiles_occupation_detail_length check (occupation_detail is null or char_length(occupation_detail) between 1 and 120),
  constraint roommate_profiles_city_length check (city is null or char_length(city) between 2 and 80),
  constraint roommate_profiles_localities_size check (
    cardinality(preferred_localities) <= 10
    and array_position(preferred_localities, null) is null
    and char_length(array_to_string(preferred_localities, '')) <= 800
  ),
  constraint roommate_profiles_budget_min_range check (budget_min is null or budget_min between 0 and 1000000),
  constraint roommate_profiles_budget_max_range check (budget_max is null or budget_max between 0 and 1000000),
  constraint roommate_profiles_budget_order check (budget_min is null or budget_max is null or budget_min <= budget_max),
  constraint roommate_profiles_move_in_range check (move_in_date is null or move_in_date between date '2020-01-01' and date '2100-01-01')
);
comment on table public.roommate_profiles is 'A person''s roommate-finder profile (1:1 with users). The owner writes it (column grants); "active" requires the basics (enforced by trigger). Others see it only through roommate_candidates() / roommate_profile_cards() or RLS when roommate_can_view() allows.';
comment on column public.roommate_profiles.city is 'A cities.name (validated by trigger when set).';
comment on column public.roommate_profiles.last_active_at is 'Bumped by the system (deck loads, swipes); not client-writable.';

create index roommate_profiles_city_active_idx on public.roommate_profiles (lower(city), last_active_at desc) where status = 'active';

create trigger roommate_profiles_set_updated_at before update on public.roommate_profiles
  for each row execute function public.set_updated_at();

alter table public.roommate_profiles enable row level security;

-- Activation rules: an active profile has the basics the deck and the engine need, a known city,
-- and its owner may use matching. Runs as the writer (no privilege needed beyond reading cities).
create function public.roommate_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.city is not null then
    select c.name into new.city from public.cities c where lower(c.name) = lower(btrim(new.city)) and c.is_active;
    if new.city is null then
      raise exception 'Choose a city from the list.' using errcode = 'ZV422';
    end if;
  end if;
  if new.status = 'active' then
    if new.headline is null or new.age is null or new.gender is null or new.city is null
       or new.budget_min is null or new.budget_max is null then
      raise exception 'Add a headline, your age, gender, city and budget before going live.' using errcode = 'ZV422';
    end if;
    if (tg_op = 'INSERT' or old.status is distinct from 'active')
       and (select auth.uid()) is not null
       and public.has_active_restriction('matching') then
      raise exception 'Your account cannot use roommate matching right now.' using errcode = 'ZV423';
    end if;
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.last_active_at := now();
  end if;
  return new;
end
$$;
revoke all on function public.roommate_profiles_guard() from public, anon, authenticated;

create trigger roommate_profiles_guard before insert or update on public.roommate_profiles
  for each row execute function public.roommate_profiles_guard();

-- ───────────────────────────── roommate_profile_photos ─────────────────────────────
create table public.roommate_profile_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.roommate_profiles (user_id) on delete cascade,
  storage_path text not null,
  position     smallint not null default 0,
  created_at   timestamptz not null default now(),
  constraint roommate_profile_photos_path_own_folder check (
    char_length(storage_path) <= 300
    and storage_path like user_id::text || '/%'
    and storage_path !~ '(\.\.|//|[\u0001-\u001F])'
  ),
  constraint roommate_profile_photos_position_range check (position between 0 and 20),
  constraint roommate_profile_photos_path_key unique (user_id, storage_path)
);
comment on table public.roommate_profile_photos is 'Photos of a roommate profile. storage_path lives in the private "roommate-photos" bucket under "<user_id>/". At most 6 per user (trigger).';

create function public.roommate_profile_photos_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('roommate_photos:' || new.user_id::text, 0));
  if (select count(*) from public.roommate_profile_photos p where p.user_id = new.user_id) >= 6 then
    raise exception 'You can add up to 6 photos.' using errcode = 'ZV422';
  end if;
  return new;
end
$$;
revoke all on function public.roommate_profile_photos_limit() from public, anon, authenticated;

create trigger roommate_profile_photos_limit before insert on public.roommate_profile_photos
  for each row execute function public.roommate_profile_photos_limit();

alter table public.roommate_profile_photos enable row level security;

-- ───────────────────────────── roommate_places ─────────────────────────────
create table public.roommate_places (
  user_id        uuid primary key references public.roommate_profiles (user_id) on delete cascade,
  property_id    uuid references public.properties (id) on delete set null,
  title          text not null,
  description    text,
  property_type  public.property_type,
  locality       text,
  city           text,
  location       extensions.geography(Point, 4326),
  rent_share     integer,
  deposit_share  integer,
  vacancies      smallint not null default 1,
  available_from date,
  furnishing     public.furnishing,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint roommate_places_title_length check (char_length(title) between 3 and 100),
  constraint roommate_places_description_length check (description is null or char_length(description) <= 1000),
  constraint roommate_places_locality_length check (locality is null or char_length(locality) between 2 and 80),
  constraint roommate_places_city_length check (city is null or char_length(city) between 2 and 80),
  constraint roommate_places_rent_range check (rent_share is null or rent_share between 0 and 1000000),
  constraint roommate_places_deposit_range check (deposit_share is null or deposit_share between 0 and 5000000),
  constraint roommate_places_vacancies_range check (vacancies between 1 and 10),
  constraint roommate_places_available_range check (available_from is null or available_from between date '2020-01-01' and date '2100-01-01')
);
comment on table public.roommate_places is 'For "I already have a place and need a roommate": the place being shared. Money is integer INR per month (rent_share) / one-time (deposit_share).';

create index roommate_places_property_idx on public.roommate_places (property_id) where property_id is not null;

create trigger roommate_places_set_updated_at before update on public.roommate_places
  for each row execute function public.set_updated_at();

alter table public.roommate_places enable row level security;

-- ───────────────────────────── roommate_preferences ─────────────────────────────
create table public.roommate_preferences (
  user_id           uuid primary key references public.roommate_profiles (user_id) on delete cascade,
  preferred_genders public.gender[] not null default '{}',
  age_min           smallint,
  age_max           smallint,
  occupation_prefs  public.occupation_type[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint roommate_preferences_genders_size check (cardinality(preferred_genders) <= 4 and array_position(preferred_genders, null) is null),
  constraint roommate_preferences_occupations_size check (cardinality(occupation_prefs) <= 3 and array_position(occupation_prefs, null) is null),
  constraint roommate_preferences_age_min_range check (age_min is null or age_min between 18 and 99),
  constraint roommate_preferences_age_max_range check (age_max is null or age_max between 18 and 99),
  constraint roommate_preferences_age_order check (age_min is null or age_max is null or age_min <= age_max)
);
comment on table public.roommate_preferences is 'Who a person wants to live with. Empty genders = no preference. Gender and age are hard filters (both directions); occupation_prefs is informational.';

create trigger roommate_preferences_set_updated_at before update on public.roommate_preferences
  for each row execute function public.set_updated_at();

alter table public.roommate_preferences enable row level security;

-- ───────────────────────────── roommate_lifestyle_answers ─────────────────────────────
create table public.roommate_lifestyle_answers (
  user_id       uuid not null references public.roommate_profiles (user_id) on delete cascade,
  question_code text not null references public.lifestyle_questions (code) on delete cascade,
  value         smallint not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, question_code)
);
comment on table public.roommate_lifestyle_answers is 'One answer per question: value is an option value of lifestyle_questions.options (validated by trigger).';

create index roommate_lifestyle_answers_question_idx on public.roommate_lifestyle_answers (question_code);

create function public.roommate_lifestyle_answers_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.lifestyle_questions q
    where q.code = new.question_code and q.is_active
      and exists (select 1 from jsonb_array_elements(q.options) o where (o ->> 'value')::int = new.value)
  ) then
    raise exception 'That answer is not one of the options.' using errcode = 'ZV422';
  end if;
  new.updated_at := now();
  return new;
end
$$;
revoke all on function public.roommate_lifestyle_answers_validate() from public, anon, authenticated;

create trigger roommate_lifestyle_answers_validate before insert or update on public.roommate_lifestyle_answers
  for each row execute function public.roommate_lifestyle_answers_validate();

alter table public.roommate_lifestyle_answers enable row level security;

-- ───────────────────────────── roommate_deal_breakers ─────────────────────────────
create table public.roommate_deal_breakers (
  user_id    uuid not null references public.roommate_profiles (user_id) on delete cascade,
  code       text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, code),
  constraint roommate_deal_breakers_code_valid check (code in ('smoking', 'drinking', 'non_veg', 'pets', 'overnight_guests', 'loud_music', 'messy', 'late_rent'))
);
comment on table public.roommate_deal_breakers is 'Hard filters a person sets (codes match DEAL_BREAKER_CODES in the compatibility engine). Applied in both directions before scoring.';

alter table public.roommate_deal_breakers enable row level security;

-- ───────────────────────────── roommate_likes ─────────────────────────────
create table public.roommate_likes (
  liker_id   uuid not null references public.users (id) on delete cascade,
  liked_id   uuid not null references public.users (id) on delete cascade,
  action     public.swipe_action not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (liker_id, liked_id),
  constraint roommate_likes_not_self check (liker_id <> liked_id)
);
comment on table public.roommate_likes is 'Swipes (like / pass). One row per ordered pair. Written only by roommate_swipe(); a user reads only their own swipes (never who liked them).';

create index roommate_likes_liked_idx on public.roommate_likes (liked_id, action);

create trigger roommate_likes_set_updated_at before update on public.roommate_likes
  for each row execute function public.set_updated_at();

alter table public.roommate_likes enable row level security;

-- ───────────────────────────── roommate_matches ─────────────────────────────
create table public.roommate_matches (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references public.users (id) on delete cascade,
  user_b          uuid not null references public.users (id) on delete cascade,
  status          public.match_status not null default 'active',
  matched_at      timestamptz not null default now(),
  ended_at        timestamptz,
  ended_by        uuid references public.users (id) on delete set null,
  -- foreign key added with the conversations table (next migration)
  conversation_id uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint roommate_matches_ordered_pair check (user_a < user_b),
  constraint roommate_matches_pair_key unique (user_a, user_b),
  constraint roommate_matches_ended_consistent check ((status = 'active') = (ended_at is null))
);
comment on table public.roommate_matches is 'A mutual like. user_a < user_b and the unique pair make a duplicate impossible. Never a booking. Created by roommate_swipe(), ended by roommate_unmatch() / block_user().';

create index roommate_matches_user_b_idx on public.roommate_matches (user_b, status);
create index roommate_matches_user_a_idx on public.roommate_matches (user_a, status);
create index roommate_matches_ended_by_idx on public.roommate_matches (ended_by) where ended_by is not null;
create index roommate_matches_conversation_idx on public.roommate_matches (conversation_id) where conversation_id is not null;

create trigger roommate_matches_set_updated_at before update on public.roommate_matches
  for each row execute function public.set_updated_at();

alter table public.roommate_matches enable row level security;

-- ───────────────────────────── compatibility_results ─────────────────────────────
create table public.compatibility_results (
  viewer_id         uuid not null references public.users (id) on delete cascade,
  candidate_id      uuid not null references public.users (id) on delete cascade,
  score             smallint not null,
  breakdown         jsonb not null default '{}'::jsonb,
  shared            text[] not null default '{}',
  conflicts         text[] not null default '{}',
  algorithm_version smallint not null,
  computed_at       timestamptz not null default now(),
  primary key (viewer_id, candidate_id),
  constraint compatibility_results_score_range check (score between 0 and 100),
  constraint compatibility_results_breakdown_object check (jsonb_typeof(breakdown) = 'object' and pg_column_size(breakdown) <= 8192),
  constraint compatibility_results_shared_size check (cardinality(shared) <= 10 and cardinality(conflicts) <= 10)
);
comment on table public.compatibility_results is 'Per-viewer cache of engine results (the engine is TypeScript). A viewer reads and writes only their own rows; values only ever affect their own view.';

create index compatibility_results_candidate_idx on public.compatibility_results (candidate_id);

alter table public.compatibility_results enable row level security;
