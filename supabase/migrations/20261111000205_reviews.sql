-- ZUVIO stage 2 / 05 — property reviews and owner replies (spec 6.5). The rating aggregates on
-- properties are maintained by the triggers in 20261111000206; policies in 20261111000208.

-- ───────────────────────────── property_reviews ─────────────────────────────
create table public.property_reviews (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  author_id   uuid not null references public.users (id) on delete cascade,
  rating      smallint not null,
  title       text,
  body        text,
  status      public.review_status not null default 'published',
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- one review per author per property, whatever its status (a removed review cannot be replaced)
  constraint property_reviews_property_author_key unique (property_id, author_id),
  constraint property_reviews_rating_range check (rating between 1 and 5),
  constraint property_reviews_title_length check (title is null or (char_length(title) between 2 and 120 and title = btrim(title))),
  constraint property_reviews_body_length check (body is null or char_length(body) between 10 and 2000)
);
comment on table public.property_reviews is 'A review of a property by someone who enquired about it: one per author per property, rating 1..5. Only status = published (and not soft-deleted) reviews of published listings are public and count towards properties.rating_avg / rating_count. The author may edit (rating, title, body) while it is published and may delete it; status is changed only by admin_set_review_status().';

create index property_reviews_property_idx on public.property_reviews (property_id, created_at desc);
create index property_reviews_author_idx on public.property_reviews (author_id);

create trigger property_reviews_set_updated_at before update on public.property_reviews
  for each row execute function public.set_updated_at();

alter table public.property_reviews enable row level security;

-- ───────────────────────────── owner_replies ─────────────────────────────
create table public.owner_replies (
  review_id  uuid primary key references public.property_reviews (id) on delete cascade,
  owner_id   uuid not null references public.property_owners (user_id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_replies_body_length check (char_length(body) between 2 and 2000)
);
comment on table public.owner_replies is 'The owner''s single public reply to a review of their own property (review_id is the primary key, so one reply per review). Visible wherever the review is visible. The owner may edit or delete it.';

create index owner_replies_owner_idx on public.owner_replies (owner_id);

create trigger owner_replies_set_updated_at before update on public.owner_replies
  for each row execute function public.set_updated_at();

alter table public.owner_replies enable row level security;
