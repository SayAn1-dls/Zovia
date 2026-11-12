-- ZUVIO stage 4 / 01 — messaging (spec 6.4) and moderation (spec 6.5) tables, plus the foreign
-- keys earlier stages left open. Policies and grants are in 20261112000403.

-- ───────────────────────────── conversations ─────────────────────────────
create table public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  kind                 public.conversation_kind not null,
  match_id             uuid references public.roommate_matches (id) on delete cascade,
  inquiry_id           uuid references public.property_inquiries (id) on delete cascade,
  property_id          uuid references public.properties (id) on delete set null,
  status               public.conversation_status not null default 'active',
  last_message_at      timestamptz,
  last_message_preview text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint conversations_match_key unique (match_id),
  constraint conversations_inquiry_key unique (inquiry_id),
  constraint conversations_kind_link check (
    (kind = 'roommate_match' and match_id is not null and inquiry_id is null)
    or (kind = 'property_inquiry' and inquiry_id is not null and match_id is null)
  ),
  constraint conversations_preview_length check (last_message_preview is null or char_length(last_message_preview) <= 160)
);
comment on table public.conversations is 'A chat between the two people of a roommate match or the two parties of a property enquiry. Created only by roommate_swipe() / start_inquiry_conversation(); members read it.';

create index conversations_property_idx on public.conversations (property_id) where property_id is not null;

create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;

alter table public.roommate_matches
  add constraint roommate_matches_conversation_fkey foreign key (conversation_id)
  references public.conversations (id) on delete set null;
alter table public.property_inquiries
  add constraint property_inquiries_conversation_fkey foreign key (conversation_id)
  references public.conversations (id) on delete set null;
alter table public.user_violations
  add constraint user_violations_conversation_fkey foreign key (conversation_id)
  references public.conversations (id) on delete set null;

-- ───────────────────────────── conversation_members ─────────────────────────────
create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  role            text not null default 'member',
  last_read_at    timestamptz,
  muted           boolean not null default false,
  joined_at       timestamptz not null default now(),
  left_at         timestamptz,
  primary key (conversation_id, user_id),
  constraint conversation_members_role_valid check (role in ('member', 'seeker', 'owner'))
);
comment on table public.conversation_members is 'Who is in a conversation. last_read_at drives read receipts (mark_conversation_read()); a member may toggle muted.';

create index conversation_members_user_idx on public.conversation_members (user_id) where left_at is null;

alter table public.conversation_members enable row level security;

-- ───────────────────────────── messages ─────────────────────────────
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid references public.users (id) on delete set null,
  kind            public.message_kind not null default 'text',
  body            text not null default '',
  moderation      public.message_moderation not null default 'clean',
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz,
  constraint messages_body_length check (char_length(body) <= 2000),
  constraint messages_text_has_body check (kind <> 'text' or char_length(body) >= 1),
  constraint messages_system_has_no_sender check (kind <> 'system' or sender_id is null)
);
comment on table public.messages is 'Chat messages. NO client INSERT/UPDATE/DELETE: every send goes through send_message() (membership, blocks, restrictions, rate limit, contact detection). Members read them; sender_id null = system message.';

create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc, id desc);
create index messages_sender_idx on public.messages (sender_id) where sender_id is not null;

alter table public.messages enable row level security;

-- ───────────────────────────── message_attachments ─────────────────────────────
create table public.message_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.messages (id) on delete cascade,
  storage_path text not null,
  mime_type    text not null,
  size_bytes   integer not null,
  width        integer,
  height       integer,
  moderation   public.message_moderation not null default 'clean',
  created_at   timestamptz not null default now(),
  constraint message_attachments_path_format check (char_length(storage_path) <= 300 and storage_path !~ '(\.\.|//|[\u0001-\u001F])'),
  constraint message_attachments_mime_valid check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint message_attachments_size_range check (size_bytes between 1 and 5242880),
  constraint message_attachments_dims check ((width is null or width between 1 and 10000) and (height is null or height between 1 and 10000))
);
comment on table public.message_attachments is 'Images sent in a chat. Objects live in the private "chat-attachments" bucket under "<conversation_id>/<sender_id>/". Written only by send_message().';

create index message_attachments_message_idx on public.message_attachments (message_id);

alter table public.message_attachments enable row level security;

-- ───────────────────────────── message_reports ─────────────────────────────
create table public.message_reports (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid references public.messages (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  reporter_id     uuid references public.users (id) on delete set null,
  reported_user_id uuid references public.users (id) on delete set null,
  reason          text not null,
  details         text,
  snapshot        jsonb not null default '{}'::jsonb,
  status          public.report_status not null default 'open',
  resolved_by     uuid references public.users (id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint message_reports_reason_valid check (reason in ('spam', 'harassment', 'inappropriate', 'scam', 'contact_sharing', 'fake_profile', 'other')),
  constraint message_reports_details_length check (details is null or char_length(details) <= 1000),
  constraint message_reports_snapshot_object check (jsonb_typeof(snapshot) = 'object'),
  constraint message_reports_note_length check (resolution_note is null or char_length(resolution_note) <= 1000)
);
comment on table public.message_reports is 'A member reporting a chat message. snapshot keeps the reported body and sender at report time (the message itself may later be deleted). Written by report_message(); resolved by admin_resolve_message_report() (admin stage).';

create unique index message_reports_one_per_reporter_idx on public.message_reports (message_id, reporter_id) where message_id is not null and reporter_id is not null;
create index message_reports_status_idx on public.message_reports (status, created_at desc);
create index message_reports_reporter_idx on public.message_reports (reporter_id) where reporter_id is not null;
create index message_reports_reported_user_idx on public.message_reports (reported_user_id) where reported_user_id is not null;
create index message_reports_conversation_idx on public.message_reports (conversation_id) where conversation_id is not null;
create index message_reports_resolved_by_idx on public.message_reports (resolved_by) where resolved_by is not null;

create trigger message_reports_set_updated_at before update on public.message_reports
  for each row execute function public.set_updated_at();

alter table public.message_reports enable row level security;

-- ───────────────────────────── reports ─────────────────────────────
create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references public.users (id) on delete set null,
  target_type     public.report_target not null,
  target_id       uuid not null,
  reason_code     text not null,
  details         text,
  status          public.report_status not null default 'open',
  resolved_by     uuid references public.users (id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint reports_reason_valid check (reason_code in ('spam', 'harassment', 'inappropriate', 'scam', 'contact_sharing', 'fake_profile', 'fake_listing', 'wrong_information', 'other')),
  constraint reports_details_length check (details is null or char_length(details) <= 1000),
  constraint reports_note_length check (resolution_note is null or char_length(resolution_note) <= 1000)
);
comment on table public.reports is 'Reports about users, listings, roommate profiles and reviews (messages use message_reports). Written by submit_report(); staff triage them (admin stage).';

create unique index reports_one_open_per_target_idx on public.reports (reporter_id, target_type, target_id)
  where status in ('open', 'in_review') and reporter_id is not null;
create index reports_status_idx on public.reports (status, created_at desc);
create index reports_target_idx on public.reports (target_type, target_id);
create index reports_reporter_idx on public.reports (reporter_id) where reporter_id is not null;
create index reports_resolved_by_idx on public.reports (resolved_by) where resolved_by is not null;

create trigger reports_set_updated_at before update on public.reports
  for each row execute function public.set_updated_at();

alter table public.reports enable row level security;

-- ───────────────────────────── moderation_actions ─────────────────────────────
create table public.moderation_actions (
  id                uuid primary key default gen_random_uuid(),
  actor_id          uuid references public.users (id) on delete set null,
  target_user_id    uuid not null references public.users (id) on delete cascade,
  action            public.moderation_action_kind not null,
  reason            text not null,
  report_id         uuid references public.reports (id) on delete set null,
  message_report_id uuid references public.message_reports (id) on delete set null,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  constraint moderation_actions_reason_length check (char_length(reason) between 1 and 500)
);
comment on table public.moderation_actions is 'Every warning / restriction / suspension. actor_id null = the system (e.g. automatic messaging restriction after repeated contact sharing). The target user may read their own and appeal.';

create index moderation_actions_target_idx on public.moderation_actions (target_user_id, created_at desc);
create index moderation_actions_actor_idx on public.moderation_actions (actor_id) where actor_id is not null;
create index moderation_actions_report_idx on public.moderation_actions (report_id) where report_id is not null;
create index moderation_actions_message_report_idx on public.moderation_actions (message_report_id) where message_report_id is not null;

alter table public.moderation_actions enable row level security;

alter table public.user_restrictions
  add constraint user_restrictions_moderation_action_fkey foreign key (moderation_action_id)
  references public.moderation_actions (id) on delete set null;

-- ───────────────────────────── appeals ─────────────────────────────
create table public.appeals (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users (id) on delete cascade,
  moderation_action_id uuid not null references public.moderation_actions (id) on delete cascade,
  statement            text not null,
  status               public.appeal_status not null default 'pending',
  decided_by           uuid references public.users (id) on delete set null,
  decided_at           timestamptz,
  decision_note        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint appeals_action_key unique (moderation_action_id),
  constraint appeals_statement_length check (char_length(statement) between 10 and 2000),
  constraint appeals_note_length check (decision_note is null or char_length(decision_note) <= 1000)
);
comment on table public.appeals is 'One appeal per moderation action, by its target user (submit_appeal()). Decided by admin_decide_appeal() (admin stage).';

create index appeals_user_idx on public.appeals (user_id);
create index appeals_status_idx on public.appeals (status, created_at);
create index appeals_decided_by_idx on public.appeals (decided_by) where decided_by is not null;

create trigger appeals_set_updated_at before update on public.appeals
  for each row execute function public.set_updated_at();

alter table public.appeals enable row level security;
