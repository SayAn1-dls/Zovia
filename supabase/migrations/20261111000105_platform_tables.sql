-- ZUVIO stage 1 / 05 — platform tables (spec 6.6) that do not depend on other domains.
-- Policies and grants are in file 07.

-- ───────────────────────────── platform_settings ─────────────────────────────
create table public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint platform_settings_key_format check (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  constraint platform_settings_description_length check (description is null or char_length(description) <= 300)
);
comment on table public.platform_settings is 'Thresholds and limits (key -> jsonb value). Staff may read; changed only through admin_update_setting(). SQL reads them with setting_int(key, fallback).';

create index platform_settings_updated_by_idx on public.platform_settings (updated_by) where updated_by is not null;

create trigger platform_settings_set_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;

insert into public.platform_settings (key, value, description) values
  ('listing_fresh_days',                    '30',  'A listing counts as "recently confirmed" for this many days after the owner confirms it.'),
  ('contact_violation_window_days',         '30',  'Window in which contact-sharing violations are counted.'),
  ('contact_violations_before_restriction', '3',   'Contact-sharing violations inside the window that trigger a temporary messaging restriction.'),
  ('messaging_restriction_hours',           '24',  'Length of the automatic messaging restriction.'),
  ('max_likes_per_day',                     '100', 'Roommate likes one user may send per day.'),
  ('max_inquiries_per_day',                 '10',  'Property enquiries one user may send per day.'),
  ('max_messages_per_minute',               '20',  'Chat messages one user may send per minute.'),
  ('max_contact_reveals_per_day',           '20',  'Owner contact reveals one user may request per day.'),
  ('max_reports_per_day',                   '20',  'Reports one user may file per day.'),
  ('assistant_requests_per_hour',           '30',  'AI assistant requests one user may make per hour.'),
  ('contact_messages_per_email_per_hour',   '3',   'Contact-form messages accepted per e-mail address per hour.'),
  ('contact_messages_per_hour',             '200', 'Contact-form messages accepted per hour in total.'),
  ('ai_usage_logs_per_hour',                '600', 'AI usage log rows one user may write per hour.')
on conflict (key) do nothing;

-- ───────────────────────────── rate_limits ─────────────────────────────
create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  count        integer not null,
  expires_at   timestamptz not null,
  constraint rate_limits_key_length check (char_length(key) between 1 and 300),
  constraint rate_limits_count_positive check (count >= 1),
  constraint rate_limits_window check (expires_at > window_start)
);
-- RLS enabled with NO policies and no grants on purpose: this table is unreachable for every API
-- role (service_role included, see the revoke in file 07). Only the SECURITY DEFINER functions
-- consume_rate_limit(), check_rate_limit() and other internal callers of rate_limit_hit() touch it.
comment on table public.rate_limits is 'Fixed-window counters, one row per key. Unreachable through the API; used only via rate_limit_hit() and its wrappers. Expired rows are pruned by a scheduled job.';

create index rate_limits_expires_at_idx on public.rate_limits (expires_at);

alter table public.rate_limits enable row level security;

-- ───────────────────────────── notifications ─────────────────────────────
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  type       public.notification_type not null,
  title      text not null,
  body       text,
  link_path  text,
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_title_length check (char_length(title) between 1 and 140),
  constraint notifications_body_length check (body is null or char_length(body) <= 500),
  -- same-origin relative path only: starts with one "/", never "//" or a scheme
  constraint notifications_link_path_relative check (
    link_path is null
    or (char_length(link_path) <= 300 and link_path ~ '^/([^/\\[:space:]][^\\[:space:]]*)?$')
  ),
  constraint notifications_data_object check (jsonb_typeof(data) = 'object')
);
comment on table public.notifications is 'In-app notifications. Created only by database functions (notify()); a user reads, marks read and deletes their own. Delivered live through Realtime (publication added by the messaging stage).';

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

-- ───────────────────────────── admin_audit_logs ─────────────────────────────
create table public.admin_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.users (id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint admin_audit_logs_action_format check (action ~ '^[a-z][a-z0-9_.]{1,79}$'),
  constraint admin_audit_logs_entity_type_format check (entity_type ~ '^[a-z][a-z0-9_]{1,59}$'),
  constraint admin_audit_logs_entity_id_length check (entity_id is null or char_length(entity_id) between 1 and 200),
  constraint admin_audit_logs_details_object check (jsonb_typeof(details) = 'object')
);
comment on table public.admin_audit_logs is 'Append-only log of staff and system actions, written by audit() inside every admin function. Staff may read. Nobody may update or delete (enforced by trigger, even for service_role); actor_id becomes NULL only when the actor''s account is purged.';

create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
create index admin_audit_logs_actor_idx on public.admin_audit_logs (actor_id, created_at desc);
create index admin_audit_logs_entity_idx on public.admin_audit_logs (entity_type, entity_id);

-- Append-only guard. The single change let through is the foreign key's own
-- "ON DELETE SET NULL" on actor_id when an account is purged; every other column must be untouched.
create function public.admin_audit_logs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.actor_id is null
       and old.actor_id is not null
       and new.id = old.id
       and new.action = old.action
       and new.entity_type = old.entity_type
       and new.entity_id is not distinct from old.entity_id
       and new.details = old.details
       and new.created_at = old.created_at
       and not exists (select 1 from public.users u where u.id = old.actor_id)
    then
      return new;
    end if;
  end if;
  raise exception 'The audit log is append-only.' using errcode = 'ZV403';
end
$$;
revoke all on function public.admin_audit_logs_guard() from public, anon, authenticated;

create trigger admin_audit_logs_no_update_delete
  before update or delete on public.admin_audit_logs
  for each row execute function public.admin_audit_logs_guard();

create trigger admin_audit_logs_no_truncate
  before truncate on public.admin_audit_logs
  for each statement execute function public.admin_audit_logs_guard();

alter table public.admin_audit_logs enable row level security;

-- ───────────────────────────── search_history ─────────────────────────────
create table public.search_history (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  source       text not null default 'web',
  query_text   text,
  filters      jsonb not null default '{}'::jsonb,
  result_count integer,
  created_at   timestamptz not null default now(),
  constraint search_history_source_valid check (source in ('web', 'assistant')),
  constraint search_history_query_length check (query_text is null or char_length(query_text) <= 500),
  constraint search_history_filters_object check (jsonb_typeof(filters) = 'object' and pg_column_size(filters) <= 8192),
  constraint search_history_result_count_range check (result_count is null or result_count >= 0)
);
comment on table public.search_history is 'A user''s own recent searches (web search and assistant). Own rows only: select, insert, delete.';

create index search_history_user_created_idx on public.search_history (user_id, created_at desc);

alter table public.search_history enable row level security;

-- ───────────────────────────── ai_usage_logs ─────────────────────────────
create table public.ai_usage_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users (id) on delete set null,
  provider      text not null,
  model         text not null,
  feature       text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  tool_calls    integer not null default 0,
  latency_ms    integer,
  status        text not null default 'success',
  error_code    text,
  created_at    timestamptz not null default now(),
  constraint ai_usage_logs_provider_format check (provider ~ '^[a-z0-9][a-z0-9_.-]{0,39}$'),
  constraint ai_usage_logs_model_length check (char_length(model) between 1 and 100),
  constraint ai_usage_logs_feature_format check (feature ~ '^[a-z0-9][a-z0-9_.-]{0,59}$'),
  constraint ai_usage_logs_tokens_range check (input_tokens >= 0 and output_tokens >= 0 and tool_calls >= 0),
  constraint ai_usage_logs_latency_range check (latency_ms is null or latency_ms >= 0),
  constraint ai_usage_logs_status_valid check (status in ('success', 'error', 'rate_limited')),
  constraint ai_usage_logs_error_code_length check (error_code is null or char_length(error_code) between 1 and 100)
);
comment on table public.ai_usage_logs is 'One row per AI provider call (tokens, latency, outcome; never prompts or answers). Inserted through log_ai_usage(); staff may read. user_id becomes NULL when the account is purged.';

create index ai_usage_logs_created_idx on public.ai_usage_logs (created_at desc);
create index ai_usage_logs_user_created_idx on public.ai_usage_logs (user_id, created_at desc);

alter table public.ai_usage_logs enable row level security;

-- ───────────────────────────── contact_messages ─────────────────────────────
create table public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      extensions.citext not null,
  phone      text,
  subject    text not null,
  message    text not null,
  user_id    uuid references public.users (id) on delete set null,
  status     text not null default 'new',
  staff_note text,
  handled_by uuid references public.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_messages_name_length check (char_length(name) between 2 and 80),
  constraint contact_messages_email_format check (char_length(email::text) <= 254 and email::text ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$'),
  constraint contact_messages_phone_format check (phone is null or phone ~ '^\+?[0-9][0-9 ()-]{5,17}[0-9]$'),
  constraint contact_messages_subject_length check (char_length(subject) between 3 and 150),
  constraint contact_messages_message_length check (char_length(message) between 10 and 4000),
  constraint contact_messages_status_valid check (status in ('new', 'in_progress', 'resolved', 'spam')),
  constraint contact_messages_staff_note_length check (staff_note is null or char_length(staff_note) <= 1000)
);
comment on table public.contact_messages is 'Messages from the public contact form, written by submit_contact_message(). Staff read them and update status / staff_note (handled_by and handled_at are stamped by trigger).';
comment on column public.contact_messages.status is 'new | in_progress | resolved | spam.';

create index contact_messages_status_created_idx on public.contact_messages (status, created_at desc);
create index contact_messages_user_idx on public.contact_messages (user_id) where user_id is not null;
create index contact_messages_handled_by_idx on public.contact_messages (handled_by) where handled_by is not null;

-- Stamps who handled a contact message; the client cannot choose these values.
create function public.contact_messages_stamp_handler()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status or new.staff_note is distinct from old.staff_note then
    new.handled_by := coalesce((select auth.uid()), old.handled_by);
    new.handled_at := now();
  end if;
  return new;
end
$$;
revoke all on function public.contact_messages_stamp_handler() from public, anon, authenticated;

create trigger contact_messages_stamp_handler before update on public.contact_messages
  for each row execute function public.contact_messages_stamp_handler();

alter table public.contact_messages enable row level security;
