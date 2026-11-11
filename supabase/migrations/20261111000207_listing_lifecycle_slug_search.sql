-- ZUVIO stage 2 / 07 — BEFORE triggers on properties: the listing lifecycle, the slug and the
-- full-text vector.

-- ───────────────────────────── listing lifecycle ─────────────────────────────
-- Spec 6.2: owner   draft -> pending_review, rejected -> pending_review, published <-> paused,
--                   any -> archived
--           staff   pending_review -> published | rejected, published -> rejected
-- Nothing else is possible, whoever asks. "archived" is final.
--
-- WHO IS ASKING
--   The trigger function is SECURITY INVOKER, so current_user is the role that really issued the
--   statement:
--   * an API role (anon, authenticated, service_role — through PostgREST or any client): always
--     treated as OWNER class. They can never perform a staff transition, so a listing that was
--     not approved can never be published by an API call. (authenticated additionally has no
--     UPDATE grant on status at all — see file 08 — so owners change status only through the
--     functions of the next stage; service_role is held to the owner transitions here.)
--   * the table owner (postgres) or a superuser — that is: code inside SECURITY DEFINER functions,
--     migrations, scheduled jobs, the SQL editor: the transaction-local setting
--     zuvio.listing_actor selects the class: 'owner' (default when unset), 'staff', or 'system'
--     (no lifecycle checks at all: maintenance scripts and test fixtures).
--   Anyone can SET a custom setting, but it is only honoured when current_user is a member of the
--   table owner, which API roles are not and cannot become. That makes the flag effectively
--   "settable only inside SECURITY DEFINER code".
--
-- HOW LATER STAGES USE IT (inside a SECURITY DEFINER function, after their own checks):
--     perform set_config('zuvio.listing_actor', 'staff', true);   -- or 'owner'
--     update public.properties set status = 'published' where id = p_property_id;
--     perform set_config('zuvio.listing_actor', '', true);
--   Always set the flag explicitly right before a status change, and clear it afterwards.
--
-- WHAT THE TRIGGER STAMPS (callers need not, and API roles cannot, set these)
--   -> pending_review : submitted_at, last_confirmed_at = now(); rejection_reason cleared.
--                       Requires a map pin, and a bed (per_bed) or monthly_rent (entire_unit) —
--                       the structural minimum; submit_property_for_review() checks completeness.
--   pending_review -> published : approved_at = now(), published_at = now(), reason cleared.
--   -> rejected       : rejection_reason must be supplied in the same UPDATE.
--   paused -> published only when approved_at is set (it always is unless 'system' bypassed).
create function public.properties_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_trusted boolean;
  v_actor   text := 'owner';
  v_ok      boolean;
begin
  select pg_catalog.pg_has_role(current_user, c.relowner, 'MEMBER') into v_trusted
  from pg_catalog.pg_class c where c.oid = tg_relid;
  v_trusted := coalesce(v_trusted, false);
  if v_trusted and pg_catalog.current_setting('zuvio.listing_actor', true) in ('staff', 'system') then
    v_actor := pg_catalog.current_setting('zuvio.listing_actor', true);
  end if;

  if v_actor = 'system' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'A new listing starts as a draft.' using errcode = 'ZV403';
    end if;
    new.rejection_reason := null;
    new.submitted_at := null;
    new.approved_at := null;
    new.published_at := null;
    new.last_confirmed_at := null;
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'A listing cannot be moved to another owner.' using errcode = 'ZV403';
  end if;

  if not v_trusted then
    -- lifecycle stamps cannot be forged by an API role, with or without a status change
    new.submitted_at := old.submitted_at;
    new.approved_at := old.approved_at;
    new.published_at := old.published_at;
    if new.status = old.status then
      new.rejection_reason := old.rejection_reason;
    end if;
  end if;

  if new.status = old.status then
    return new;
  end if;

  v_ok := case
    when old.status = 'archived' then false
    when new.status = 'archived' then true
    when old.status in ('draft', 'rejected') and new.status = 'pending_review' then true
    when old.status = 'published' and new.status = 'paused' then true
    when old.status = 'paused' and new.status = 'published' then old.approved_at is not null
    when v_actor = 'staff' and old.status = 'pending_review' and new.status in ('published', 'rejected') then true
    when v_actor = 'staff' and old.status = 'published' and new.status = 'rejected' then true
    else false
  end;
  if not v_ok then
    raise exception 'This listing cannot be moved from "%" to "%".',
      pg_catalog.replace(old.status::text, '_', ' '), pg_catalog.replace(new.status::text, '_', ' ')
      using errcode = 'ZV403';
  end if;

  if new.status = 'pending_review' then
    if new.location is null then
      raise exception 'Pin the property on the map before submitting it.' using errcode = 'ZV422';
    end if;
    if new.listing_mode = 'per_bed' and new.total_beds < 1 then
      raise exception 'Add at least one room with a bed before submitting this listing.' using errcode = 'ZV422';
    end if;
    if new.listing_mode = 'entire_unit' and new.monthly_rent is null then
      raise exception 'Add the monthly rent before submitting this listing.' using errcode = 'ZV422';
    end if;
    new.submitted_at := now();
    new.last_confirmed_at := now();
    new.rejection_reason := null;
  elsif new.status = 'published' and old.status = 'pending_review' then
    new.approved_at := now();
    new.published_at := now();
    new.rejection_reason := null;
  elsif new.status = 'rejected' then
    new.rejection_reason := nullif(pg_catalog.btrim(coalesce(new.rejection_reason, '')), '');
    if new.rejection_reason is null then
      raise exception 'Give the owner a reason for the rejection.' using errcode = 'ZV422';
    end if;
  end if;
  return new;
end
$$;
revoke all on function public.properties_lifecycle() from public, anon, authenticated;

create trigger properties_lifecycle
  before insert or update on public.properties
  for each row execute function public.properties_lifecycle();

-- ───────────────────────────── slug ─────────────────────────────
-- Internal: lower-case ASCII words joined by "-". unaccent is called with its dictionary named
-- explicitly because the one-argument form needs the extensions schema on the search_path.
create function public.slugify(p_text text)
returns text
language sql
stable
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.lower(extensions.unaccent('extensions.unaccent'::pg_catalog.regdictionary, coalesce(p_text, ''))),
      '[^a-z0-9]+', '-', 'g'),
    '-')
$$;
revoke all on function public.slugify(text) from public, anon, authenticated;
comment on function public.slugify(text) is 'Internal (not API-callable): "Sunny PG, Koramangala" -> "sunny-pg-koramangala".';

-- slug = <title, max 60> - <locality, max 30> - <first 8 hex digits of the id>. The id part makes
-- it unique in practice; on the (astronomically unlikely) collision more id digits are used.
-- Set on insert and re-made while the listing is a never-published draft; frozen afterwards so
-- public URLs stay stable. A client-supplied slug is always ignored.
-- SECURITY DEFINER: the uniqueness probe must see every listing, not only the caller's.
create function public.properties_set_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_hex  text := pg_catalog.replace(new.id::text, '-', '');
  v_len  integer := 8;
  v_slug text;
begin
  if tg_op = 'UPDATE' then
    if not (old.status = 'draft' and new.status = 'draft' and old.published_at is null
            and (new.title is distinct from old.title or new.locality is distinct from old.locality)) then
      new.slug := old.slug;
      return new;
    end if;
  end if;

  v_base := pg_catalog.btrim(pg_catalog.left(public.slugify(new.title), 60), '-');
  if v_base = '' then
    v_base := 'listing';
  end if;
  if public.slugify(new.locality) <> '' then
    v_base := v_base || '-' || pg_catalog.btrim(pg_catalog.left(public.slugify(new.locality), 30), '-');
  end if;

  loop
    v_slug := v_base || '-' || pg_catalog.left(v_hex, v_len);
    exit when v_len >= 32
      or not exists (select 1 from public.properties p where p.slug = v_slug and p.id <> new.id);
    v_len := v_len + 4;
  end loop;
  new.slug := v_slug;
  return new;
end
$$;
revoke all on function public.properties_set_slug() from public, anon, authenticated;

create trigger properties_set_slug
  before insert or update on public.properties
  for each row execute function public.properties_set_slug();

-- ───────────────────────────── full-text vector ─────────────────────────────
create function public.properties_search_tsv()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.title is distinct from old.title
     or new.locality is distinct from old.locality
     or new.city is distinct from old.city
     or new.property_type is distinct from old.property_type
     or new.landmark is distinct from old.landmark
     or new.address_line is distinct from old.address_line
     or new.pincode is distinct from old.pincode
     or new.description is distinct from old.description
     or new.search_tsv is distinct from old.search_tsv
  then
    new.search_tsv :=
      pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english'::pg_catalog.regconfig,
        extensions.unaccent('extensions.unaccent'::pg_catalog.regdictionary, coalesce(new.title, ''))), 'A')
      || pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english'::pg_catalog.regconfig,
        extensions.unaccent('extensions.unaccent'::pg_catalog.regdictionary,
          coalesce(new.locality, '') || ' ' || coalesce(new.city, '') || ' '
          || pg_catalog.replace(new.property_type::text, '_', ' '))), 'B')
      || pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english'::pg_catalog.regconfig,
        extensions.unaccent('extensions.unaccent'::pg_catalog.regdictionary,
          coalesce(new.landmark, '') || ' ' || coalesce(new.address_line, '') || ' ' || coalesce(new.pincode, ''))), 'C')
      || pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english'::pg_catalog.regconfig,
        extensions.unaccent('extensions.unaccent'::pg_catalog.regdictionary, coalesce(new.description, ''))), 'D');
  end if;
  return new;
end
$$;
revoke all on function public.properties_search_tsv() from public, anon, authenticated;

create trigger properties_search_tsv
  before insert or update on public.properties
  for each row execute function public.properties_search_tsv();
