-- Roommate directory: a browsable list of roommate profiles whose owners opted in.
--
-- Privacy model (see 20261116000100_private_user_cards.sql: the user base must not be listable):
--   * Signed-in, usable accounts only. anon has no grant; suspended and deleted callers get ZV423.
--   * A profile is listed only when its owner consented ("Everyone on Zovia can see this profile")
--     AND turned visibility on. Default: hidden, no consent.
--   * Listed people: active profile, usable account (not suspended / deleted), not restricted from
--     matching, never the caller, never anyone in a block with the caller (either direction).
--   * Cards carry an allow-list of fields only: display name, city, preferred localities, budget
--     range, move-in date, a few lifestyle answers (as tags), the first photo, the owner's
--     Available flag, and age + gender only when the owner chose to show them. Never phone,
--     e-mail, last_active_at, exact location, headline/about, preferences or deal-breakers.
--   * Contact stays like -> match -> chat: roommate_swipe() and roommate_can_view() are unchanged.
-- Error contract as in 20261112000404: ZV400 bad request, ZV401 signed out, ZV423 restricted.

-- ───────────────────────────── columns ─────────────────────────────
alter table public.roommate_profiles
  add column directory_visible    boolean not null default false,
  add column directory_consent_at timestamptz,
  add column available            boolean not null default true,
  add column show_age_gender      boolean not null default false,
  add constraint roommate_profiles_directory_needs_consent check (not directory_visible or directory_consent_at is not null);

comment on column public.roommate_profiles.directory_visible is 'Owner''s Hide/Show switch for the roommate directory. Only effective with directory_consent_at set (check constraint). Default hidden.';
comment on column public.roommate_profiles.directory_consent_at is 'When the owner agreed that everyone signed in to Zovia may see this profile in the directory. Stamped by the server (trigger), null = no consent; clearing it also hides the profile.';
comment on column public.roommate_profiles.available is 'Owner-set Available / Not available badge shown in the directory.';
comment on column public.roommate_profiles.show_age_gender is 'When true the directory card includes age and gender; otherwise both are left out of the card.';

-- The owner writes the four columns (same column-grant model as 20261112000403); the existing
-- roommate_profiles_update_own policy limits UPDATE to the owner's own, usable account.
grant insert (directory_visible, directory_consent_at, available, show_age_gender) on public.roommate_profiles to authenticated;
grant update (directory_visible, directory_consent_at, available, show_age_gender) on public.roommate_profiles to authenticated;

-- Consent time is the server's, never the client's: a first consent is stamped now(), a later
-- write cannot back- or forward-date it, and withdrawing consent (null) also hides the profile.
create function public.roommate_profiles_directory_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.directory_consent_at is null then
    new.directory_visible := false;
  elsif tg_op = 'INSERT' or old.directory_consent_at is null then
    new.directory_consent_at := now();
  else
    new.directory_consent_at := old.directory_consent_at;
  end if;
  return new;
end
$$;
revoke all on function public.roommate_profiles_directory_guard() from public, anon, authenticated;
comment on function public.roommate_profiles_directory_guard() is 'Trigger: stamps directory consent with the server time, keeps it fixed afterwards, and hides the profile when consent is withdrawn.';

create trigger roommate_profiles_directory_guard before insert or update on public.roommate_profiles
  for each row execute function public.roommate_profiles_directory_guard();

-- Directory pages: listed profiles by city, newest consent first.
create index roommate_profiles_directory_idx on public.roommate_profiles (lower(city), directory_consent_at desc, user_id)
  where status = 'active' and directory_visible;

-- ───────────────────────────── who is listed ─────────────────────────────
-- True when the caller may see this person in the directory. Executable by "authenticated"
-- because the storage policy below evaluates it with the caller's privileges; through the API it
-- only answers what roommate_directory() already shows the caller.
create function public.roommate_directory_is_listed(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.is_active_user()
    and p_user_id is not null
    and p_user_id <> (select auth.uid())
    and exists (select 1 from public.roommate_profiles p
                join public.users u on u.id = p.user_id
                where p.user_id = p_user_id
                  and p.status = 'active'
                  and p.directory_visible
                  and p.directory_consent_at is not null
                  and u.status in ('active', 'restricted')
                  and u.deleted_at is null)
    and not public.is_blocked_pair((select auth.uid()), p_user_id)
    and not exists (select 1 from public.user_restrictions r
                    where r.user_id = p_user_id and r.lifted_at is null and r.starts_at <= now()
                      and (r.ends_at is null or r.ends_at > now()) and r.kind in ('matching', 'all')),
    false)
$$;
revoke all on function public.roommate_directory_is_listed(uuid) from public, anon, authenticated;
grant execute on function public.roommate_directory_is_listed(uuid) to authenticated, service_role;
comment on function public.roommate_directory_is_listed(uuid) is 'True when the caller (usable account) may see this person in the roommate directory: consented and visible active profile, usable account, not restricted from matching, not the caller, no block either way.';

-- True when the storage object is the FIRST photo of a person listed for the caller. Only that
-- one photo is opened up; the rest stay behind roommate_can_view().
create function public.roommate_directory_photo_visible(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(coalesce(p_name, ''), '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.roommate_directory_is_listed(split_part(p_name, '/', 1)::uuid)
         and p_name = (select ph.storage_path from public.roommate_profile_photos ph
                       where ph.user_id = split_part(p_name, '/', 1)::uuid
                       order by ph.position, ph.created_at
                       limit 1)
    else false
  end
$$;
revoke all on function public.roommate_directory_photo_visible(text) from public, anon, authenticated;
grant execute on function public.roommate_directory_photo_visible(text) to authenticated, service_role;
comment on function public.roommate_directory_photo_visible(text) is 'True when a roommate-photos object is the first photo of a person the caller may see in the directory (storage policy helper).';

create policy roommate_photos_directory_select on storage.objects
  for select to authenticated
  using (bucket_id = 'roommate-photos' and public.roommate_directory_photo_visible(name));

-- ───────────────────────────── the directory ─────────────────────────────
-- Returns {items: [card], has_more, limit, offset}. A card has exactly these keys:
--   user_id, display_name, city, preferred_localities, budget_min, budget_max, move_in_date,
--   available, lifestyle ({question_code: value} for a fixed set of questions), photo_path,
--   and age + gender only when the owner set show_age_gender.
create function public.roommate_directory(
  p_city      text    default null,
  p_available boolean default null,
  p_limit     integer default 24,
  p_offset    integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid    := (select auth.uid());
  v_city   text    := nullif(btrim(coalesce(p_city, '')), '');
  v_limit  integer := least(greatest(coalesce(p_limit, 24), 1), 48);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 10000);
  v_items  jsonb;
  v_rows   integer;
begin
  if v_uid is null then
    raise exception 'Please sign in to continue.' using errcode = 'ZV401';
  end if;
  if not public.is_active_user() then
    raise exception 'Your account cannot browse roommates right now.' using errcode = 'ZV423';
  end if;
  if v_city is not null and char_length(v_city) > 80 then
    raise exception 'That city is not valid.' using errcode = 'ZV400';
  end if;

  -- One row more than the page tells whether another page exists. ord is numbered after
  -- LIMIT/OFFSET, so it runs 1..limit+1 on every page.
  with window_rows as (
    select p.user_id, p.city, p.preferred_localities, p.budget_min, p.budget_max, p.move_in_date,
           p.available, p.show_age_gender, p.age, p.gender, p.directory_consent_at,
           coalesce(up.display_name, 'Member') as display_name
    from public.roommate_profiles p
    left join public.user_profiles up on up.user_id = p.user_id
    where p.status = 'active'
      and p.directory_visible
      and (v_city is null or lower(p.city) = lower(v_city))
      and (p_available is null or p.available = p_available)
      and public.roommate_directory_is_listed(p.user_id)
    order by p.directory_consent_at desc, p.user_id
    limit v_limit + 1 offset v_offset
  ),
  page as (
    select w.*, row_number() over (order by w.directory_consent_at desc, w.user_id) as ord from window_rows w
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id', pg.user_id,
        'display_name', pg.display_name,
        'city', pg.city,
        'preferred_localities', to_jsonb(pg.preferred_localities),
        'budget_min', pg.budget_min,
        'budget_max', pg.budget_max,
        'move_in_date', pg.move_in_date,
        'available', pg.available,
        'lifestyle', coalesce((select jsonb_object_agg(a.question_code, a.value)
                               from public.roommate_lifestyle_answers a
                               where a.user_id = pg.user_id
                                 and a.question_code in ('food_habit', 'smoking', 'drinking', 'sleep_schedule', 'cleanliness', 'pets')),
                              '{}'::jsonb),
        'photo_path', (select ph.storage_path from public.roommate_profile_photos ph
                       where ph.user_id = pg.user_id
                       order by ph.position, ph.created_at
                       limit 1)
      )
      || case when pg.show_age_gender then jsonb_build_object('age', pg.age, 'gender', pg.gender) else '{}'::jsonb end
      order by pg.ord) filter (where pg.ord <= v_limit), '[]'::jsonb),
    count(*)
  into v_items, v_rows
  from page pg;

  return jsonb_build_object('items', v_items, 'has_more', v_rows > v_limit, 'limit', v_limit, 'offset', v_offset);
end
$$;
revoke all on function public.roommate_directory(text, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.roommate_directory(text, boolean, integer, integer) to authenticated;
comment on function public.roommate_directory(text, boolean, integer, integer) is 'Roommate directory page for a signed-in, usable account: {items, has_more, limit, offset}. Only consented, visible, active profiles the caller may see (roommate_directory_is_listed); cards carry an allow-list of fields, age/gender only when the owner opted in. limit 1..48, offset 0..10000. ZV401 signed out, ZV423 suspended.';
