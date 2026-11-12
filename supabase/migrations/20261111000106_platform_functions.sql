-- ZUVIO stage 1 / 06 — platform functions.
--
-- Naming: every parameter is prefixed p_ (PostgREST passes arguments by name, so these names are
-- the API contract). Errors use the ZVxxx SQLSTATE contract with messages that are safe to show.
-- Every function: empty search_path, fully qualified names, EXECUTE revoked from PUBLIC/anon/
-- authenticated and then granted only where stated at the bottom of each block.

-- ───────────────────────────── settings ─────────────────────────────
-- Internal getter for later stages. Returns the fallback when the key is missing or not an integer.
create function public.setting_int(p_key text, p_fallback integer)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_value jsonb;
begin
  select s.value into v_value from public.platform_settings s where s.key = p_key;
  if v_value is null or jsonb_typeof(v_value) <> 'number' then
    return p_fallback;
  end if;
  return (v_value #>> '{}')::numeric::integer;
exception
  when others then
    return p_fallback;
end
$$;
revoke all on function public.setting_int(text, integer) from public, anon, authenticated;
comment on function public.setting_int(text, integer) is 'Internal (not API-callable): integer value of a platform_settings key, or the fallback when missing/invalid. Call from SECURITY DEFINER functions.';

-- ───────────────────────────── rate limiting ─────────────────────────────
-- Internal primitive. Fixed window per key: the first hit opens a window of p_window_seconds;
-- hits inside it are counted; the first hit after it expires starts a new window.
--
-- Concurrency: one row per key and a single INSERT ... ON CONFLICT (key) DO UPDATE. Concurrent
-- callers for the same key queue on the row lock taken by the upsert and each sees the previous
-- caller's committed count, so N simultaneous calls are counted as exactly N (no read-then-write
-- gap). clock_timestamp() is used instead of now() so long transactions still see real time.
--
-- Note for callers that RAISE after a refused hit: the exception rolls the increment back, which
-- is harmless — the counter stays at the limit and the next attempt is refused again.
create function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now   timestamptz := clock_timestamp();
  v_count integer;
begin
  if p_key is null or char_length(p_key) not between 1 and 300
     or p_max is null or p_max < 1
     or p_window_seconds is null or p_window_seconds not between 1 and 2678400 then
    raise exception 'Invalid rate limit arguments.' using errcode = 'ZV400';
  end if;

  insert into public.rate_limits as r (key, window_start, count, expires_at)
  values (p_key, v_now, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (key) do update set
    count        = case when r.expires_at <= v_now then 1 else least(r.count, 1000000000) + 1 end,
    window_start = case when r.expires_at <= v_now then excluded.window_start else r.window_start end,
    expires_at   = case when r.expires_at <= v_now then excluded.expires_at else r.expires_at end
  returning r.count into v_count;

  return v_count <= p_max;
end
$$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
comment on function public.rate_limit_hit(text, integer, integer) is 'Internal (not API-callable): counts one hit against a fixed-window limit and returns true while the caller is within p_max. Namespace your key (e.g. "inquiry:<uid>").';

-- For the signed-in caller. Key = user + action + window, so a user can only ever spend their own
-- budget and cannot touch keys used by check_rate_limit() or internal callers.
create function public.consume_rate_limit(p_action text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Please sign in to continue.' using errcode = 'ZV401';
  end if;
  if p_action is null or p_action !~ '^[a-z][a-z0-9_.:-]{0,63}$' then
    raise exception 'Invalid rate limit action.' using errcode = 'ZV400';
  end if;
  return public.rate_limit_hit('u:' || v_uid::text || ':' || p_action || ':' || p_window_seconds::text, p_max, p_window_seconds);
end
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated;
comment on function public.consume_rate_limit(text, integer, integer) is 'Counts one hit for the signed-in caller against "p_max per p_window_seconds" for p_action; true = allowed, false = over the limit. ZV401 when signed out, ZV400 on bad arguments. Concurrency-safe.';

-- For the trusted server (anonymous traffic, keyed e.g. by hashed IP). service_role only.
create function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_key is null or char_length(p_key) not between 1 and 200 then
    raise exception 'Invalid rate limit key.' using errcode = 'ZV400';
  end if;
  return public.rate_limit_hit('k:' || p_key, p_max, p_window_seconds);
end
$$;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
comment on function public.check_rate_limit(text, integer, integer) is 'service_role only: counts one hit against "p_max per p_window_seconds" for an arbitrary key; true = allowed. Used by the server-side Postgres rate limiter.';

-- ───────────────────────────── notifications ─────────────────────────────
-- Internal: creates a notification. Never raises on over-long text or a bad link (they are
-- trimmed / dropped) and silently skips users that do not exist or are deleted, so a notification
-- can never break the business action that sends it. Returns the new id or NULL.
create function public.notify(
  p_user_id   uuid,
  p_type      public.notification_type,
  p_title     text,
  p_body      text default null,
  p_link_path text default null,
  p_data      jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_title text := left(btrim(coalesce(p_title, '')), 140);
  v_body  text := nullif(left(btrim(coalesce(p_body, '')), 500), '');
  v_link  text := p_link_path;
  v_data  jsonb := coalesce(p_data, '{}'::jsonb);
begin
  if p_user_id is null or p_type is null or v_title = '' then
    return null;
  end if;
  if v_link is not null and (char_length(v_link) > 300 or v_link !~ '^/([^/\\[:space:]][^\\[:space:]]*)?$') then
    v_link := null;
  end if;
  if jsonb_typeof(v_data) <> 'object' then
    v_data := '{}'::jsonb;
  end if;

  insert into public.notifications (user_id, type, title, body, link_path, data)
  select u.id, p_type, v_title, v_body, v_link, v_data
  from public.users u
  where u.id = p_user_id and u.status <> 'deleted'
  returning id into v_id;

  return v_id;
end
$$;
revoke all on function public.notify(uuid, public.notification_type, text, text, text, jsonb) from public, anon, authenticated;
comment on function public.notify(uuid, public.notification_type, text, text, text, jsonb) is 'Internal (not API-callable): creates a notification for a user. Trims title (140) and body (500), drops a link that is not a same-origin relative path, skips missing/deleted users. Returns the id or NULL.';

create function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Please sign in to continue.' using errcode = 'ZV401';
  end if;
  if p_ids is not null and cardinality(p_ids) > 500 then
    raise exception 'Too many notifications in one request.' using errcode = 'ZV400';
  end if;

  -- SECURITY INVOKER: the caller's own RLS policy and column grant (read_at only) apply.
  update public.notifications n
  set read_at = now()
  where n.user_id = v_uid
    and n.read_at is null
    and (p_ids is null or n.id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon, authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
comment on function public.mark_notifications_read(uuid[]) is 'Marks the caller''s unread notifications as read: the given ids (max 500; other people''s ids are ignored) or all of them when p_ids is null. Returns how many were marked. ZV401 when signed out.';

-- ───────────────────────────── audit ─────────────────────────────
-- Internal: appends to admin_audit_logs. The actor is always auth.uid() (NULL = system / cron);
-- callers can never supply one.
create function public.audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   text default null,
  p_details     jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values ((select auth.uid()), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end
$$;
revoke all on function public.audit(text, text, text, jsonb) from public, anon, authenticated;
comment on function public.audit(text, text, text, jsonb) is 'Internal (not API-callable): appends one admin_audit_logs row with actor = auth.uid(). action like "property.approve", entity_type like "property"; a failure here aborts the calling admin function on purpose.';

-- Convenience overload for uuid entity ids.
create function public.audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid,
  p_details     jsonb default '{}'::jsonb
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select public.audit(p_action, p_entity_type, p_entity_id::text, p_details)
$$;
revoke all on function public.audit(text, text, uuid, jsonb) from public, anon, authenticated;
comment on function public.audit(text, text, uuid, jsonb) is 'Internal (not API-callable): audit() for a uuid entity id.';

-- ───────────────────────────── contact form ─────────────────────────────
-- Public contact form. SECURITY DEFINER because nobody may insert into contact_messages directly.
-- Throttling (both limits come from platform_settings): per e-mail address per hour, then a
-- global hourly cap that bounds what a flood of made-up addresses can write. Validation runs
-- first so malformed requests never consume either budget.
create function public.submit_contact_message(
  p_name    text,
  p_email   text,
  p_phone   text,
  p_subject text,
  p_message text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_name    text := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]+', ' ', 'g'));
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_phone   text := nullif(btrim(coalesce(p_phone, '')), '');
  v_subject text := btrim(regexp_replace(coalesce(p_subject, ''), '[[:cntrl:]]+', ' ', 'g'));
  -- keep line breaks and tabs in the message, drop every other control character
  v_message text := btrim(regexp_replace(coalesce(p_message, ''), '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]', '', 'g'));
  v_id      uuid;
begin
  if char_length(v_name) not between 2 and 80 then
    raise exception 'Please enter your name (2 to 80 characters).' using errcode = 'ZV422';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$' then
    raise exception 'Please enter a valid e-mail address.' using errcode = 'ZV422';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9][0-9 ()-]{5,17}[0-9]$' then
    raise exception 'Please enter a valid phone number or leave it empty.' using errcode = 'ZV422';
  end if;
  if char_length(v_subject) not between 3 and 150 then
    raise exception 'Please enter a subject (3 to 150 characters).' using errcode = 'ZV422';
  end if;
  if char_length(v_message) not between 10 and 4000 then
    raise exception 'Please enter a message (10 to 4000 characters).' using errcode = 'ZV422';
  end if;

  if not public.rate_limit_hit(
       'contact:email:' || md5(v_email),
       greatest(public.setting_int('contact_messages_per_email_per_hour', 3), 1),
       3600) then
    raise exception 'You have sent several messages recently. Please try again in an hour.' using errcode = 'ZV429';
  end if;
  if not public.rate_limit_hit(
       'contact:global',
       greatest(public.setting_int('contact_messages_per_hour', 200), 1),
       3600) then
    raise exception 'We are receiving a lot of messages right now. Please try again later.' using errcode = 'ZV429';
  end if;

  insert into public.contact_messages (name, email, phone, subject, message, user_id)
  values (v_name, v_email, v_phone, v_subject, v_message,
          (select u.id from public.users u where u.id = v_uid))
  returning id into v_id;
  return v_id;
end
$$;
revoke all on function public.submit_contact_message(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_contact_message(text, text, text, text, text) to anon, authenticated;
comment on function public.submit_contact_message(text, text, text, text, text) is 'Contact form (anon and signed-in). Validates and stores a message, returns its id. ZV422 with a field-specific message on invalid input; ZV429 when the per-e-mail (default 3/hour) or global (default 200/hour) limit is reached. p_phone may be null.';

-- ───────────────────────────── AI usage ─────────────────────────────
-- Called by the server with the user's own session after each AI provider call. The user id is
-- auth.uid(), never an argument. Throttled so a client calling it directly cannot flood the table.
create function public.log_ai_usage(
  p_provider      text,
  p_model         text,
  p_feature       text,
  p_input_tokens  integer default 0,
  p_output_tokens integer default 0,
  p_tool_calls    integer default 0,
  p_latency_ms    integer default null,
  p_status        text default 'success',
  p_error_code    text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null or not exists (select 1 from public.users u where u.id = v_uid) then
    raise exception 'Please sign in to continue.' using errcode = 'ZV401';
  end if;
  if p_provider is null or p_provider !~ '^[a-z0-9][a-z0-9_.-]{0,39}$'
     or p_model is null or char_length(p_model) not between 1 and 100
     or p_feature is null or p_feature !~ '^[a-z0-9][a-z0-9_.-]{0,59}$'
     or coalesce(p_input_tokens, 0) < 0 or coalesce(p_output_tokens, 0) < 0 or coalesce(p_tool_calls, 0) < 0
     or (p_latency_ms is not null and p_latency_ms < 0)
     or p_status is null or p_status not in ('success', 'error', 'rate_limited')
     or (p_error_code is not null and char_length(p_error_code) not between 1 and 100) then
    raise exception 'Invalid AI usage record.' using errcode = 'ZV422';
  end if;
  if not public.rate_limit_hit('ai_log:' || v_uid::text,
                               greatest(public.setting_int('ai_usage_logs_per_hour', 600), 1), 3600) then
    raise exception 'Too many requests. Please slow down.' using errcode = 'ZV429';
  end if;

  insert into public.ai_usage_logs (user_id, provider, model, feature, input_tokens, output_tokens, tool_calls, latency_ms, status, error_code)
  values (v_uid, p_provider, p_model, p_feature, coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0),
          coalesce(p_tool_calls, 0), p_latency_ms, p_status, p_error_code)
  returning id into v_id;
  return v_id;
end
$$;
revoke all on function public.log_ai_usage(text, text, text, integer, integer, integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.log_ai_usage(text, text, text, integer, integer, integer, integer, text, text) to authenticated;
comment on function public.log_ai_usage(text, text, text, integer, integer, integer, integer, text, text) is 'Records one AI provider call for the signed-in caller and returns the row id. provider/feature are lower-case slugs; status is success | error | rate_limited. ZV401 signed out, ZV422 invalid, ZV429 over 600 rows/hour.';
