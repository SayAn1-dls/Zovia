-- ZUVIO stage 4 / 04 — roommate matching functions (spec 6.3).
--
-- The compatibility engine itself is TypeScript (src/features/roommates/compatibility). These
-- functions return the raw "cards" it scores and do everything that crosses users: the candidate
-- pool, swipes, the atomic mutual match, unmatch and blocks.
-- Error contract: ZV400 bad request, ZV401 signed out, ZV403 forbidden, ZV404 not found,
-- ZV409 conflict, ZV422 invalid, ZV423 restricted, ZV429 rate limited.

-- ───────────────────────────── cards ─────────────────────────────
-- Internal: one person's roommate card as jsonb (the shape the engine's RoommateCard expects,
-- plus display fields). Callers decide whether the viewer may see it.
create function public.roommate_card(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', p.user_id,
    'display_name', coalesce(up.display_name, 'Member'),
    'avatar_path', up.avatar_path,
    'status', p.status,
    'headline', p.headline,
    'about', p.about,
    'age', p.age,
    'gender', p.gender,
    'occupation', p.occupation,
    'occupation_detail', p.occupation_detail,
    'city', p.city,
    'preferred_localities', to_jsonb(p.preferred_localities),
    'budget_min', p.budget_min,
    'budget_max', p.budget_max,
    'move_in_date', p.move_in_date,
    'has_place', p.has_place,
    'last_active_at', p.last_active_at,
    'photos', coalesce((select jsonb_agg(ph.storage_path order by ph.position, ph.created_at)
                        from public.roommate_profile_photos ph where ph.user_id = p.user_id), '[]'::jsonb),
    'answers', coalesce((select jsonb_object_agg(a.question_code, a.value)
                         from public.roommate_lifestyle_answers a where a.user_id = p.user_id), '{}'::jsonb),
    'deal_breakers', coalesce((select jsonb_agg(d.code order by d.code)
                               from public.roommate_deal_breakers d where d.user_id = p.user_id), '[]'::jsonb),
    'preferences', (select jsonb_build_object('preferred_genders', to_jsonb(r.preferred_genders),
                                              'age_min', r.age_min, 'age_max', r.age_max,
                                              'occupation_prefs', to_jsonb(r.occupation_prefs))
                    from public.roommate_preferences r where r.user_id = p.user_id),
    'place', (select jsonb_build_object('title', pl.title, 'description', pl.description,
                                        'property_type', pl.property_type, 'locality', pl.locality,
                                        'city', pl.city, 'rent_share', pl.rent_share,
                                        'deposit_share', pl.deposit_share, 'vacancies', pl.vacancies,
                                        'available_from', pl.available_from, 'furnishing', pl.furnishing)
              from public.roommate_places pl where pl.user_id = p.user_id)
  )
  from public.roommate_profiles p
  left join public.user_profiles up on up.user_id = p.user_id
  where p.user_id = p_user_id
$$;
revoke all on function public.roommate_card(uuid) from public, anon, authenticated;
comment on function public.roommate_card(uuid) is 'Internal (not API-callable): a roommate card as jsonb. Does not check who is asking.';

-- Cards of specific people the caller may see (own card, matches, a conversation partner).
create function public.roommate_profile_cards(p_user_ids uuid[])
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Please sign in to continue.' using errcode = 'ZV401';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return;
  end if;
  if cardinality(p_user_ids) > 100 then
    raise exception 'Too many profiles in one request.' using errcode = 'ZV400';
  end if;
  return query
    select public.roommate_card(t.id)
    from (select distinct unnest(p_user_ids) as id) t
    where exists (select 1 from public.roommate_profiles p where p.user_id = t.id)
      and public.roommate_can_view(t.id);
end
$$;
revoke all on function public.roommate_profile_cards(uuid[]) from public, anon, authenticated;
grant execute on function public.roommate_profile_cards(uuid[]) to authenticated;
comment on function public.roommate_profile_cards(uuid[]) is 'Roommate cards (jsonb) of up to 100 people, silently skipping anyone the caller may not see (roommate_can_view).';

-- ───────────────────────────── candidates ─────────────────────────────
-- The caller's pool: active profiles in the same city, usable accounts, mutual gender preference,
-- not blocked either way, not already swiped, no existing match, not restricted from matching.
-- Ordered by recent activity; the TypeScript engine applies deal-breakers and ranks.
create function public.roommate_candidates(p_limit integer default 60)
returns setof jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_me      public.roommate_profiles;
  v_genders public.gender[];
begin
  if v_uid is null then
    raise exception 'Please sign in to continue.' using errcode = 'ZV401';
  end if;
  if not public.is_active_user() then
    raise exception 'Your account cannot use roommate matching right now.' using errcode = 'ZV423';
  end if;
  select * into v_me from public.roommate_profiles where user_id = v_uid;
  if not found then
    raise exception 'Create your roommate profile first.' using errcode = 'ZV404';
  end if;
  if v_me.status <> 'active' then
    raise exception 'Your roommate profile is not live.' using errcode = 'ZV409';
  end if;
  if public.has_active_restriction('matching') then
    raise exception 'Your account cannot use roommate matching right now.' using errcode = 'ZV423';
  end if;

  update public.roommate_profiles set last_active_at = now() where user_id = v_uid;
  select coalesce(r.preferred_genders, '{}') into v_genders from public.roommate_preferences r where r.user_id = v_uid;
  v_genders := coalesce(v_genders, '{}');

  return query
    select public.roommate_card(p.user_id)
    from public.roommate_profiles p
    join public.users u on u.id = p.user_id and u.status in ('active', 'restricted') and u.deleted_at is null
    left join public.roommate_preferences rp on rp.user_id = p.user_id
    where p.status = 'active'
      and p.user_id <> v_uid
      and lower(p.city) = lower(v_me.city)
      and not public.is_blocked_pair(v_uid, p.user_id)
      and not exists (select 1 from public.roommate_likes l where l.liker_id = v_uid and l.liked_id = p.user_id)
      and not exists (select 1 from public.roommate_matches x
                      where x.user_a = least(v_uid, p.user_id) and x.user_b = greatest(v_uid, p.user_id))
      and (cardinality(v_genders) = 0 or p.gender = any (v_genders))
      and (rp.user_id is null or cardinality(rp.preferred_genders) = 0 or v_me.gender = any (rp.preferred_genders))
      and not exists (select 1 from public.user_restrictions r
                      where r.user_id = p.user_id and r.lifted_at is null and r.starts_at <= now()
                        and (r.ends_at is null or r.ends_at > now()) and r.kind in ('matching', 'all'))
    order by p.last_active_at desc, p.user_id
    limit least(greatest(coalesce(p_limit, 60), 1), 200);
end
$$;
revoke all on function public.roommate_candidates(integer) from public, anon, authenticated;
grant execute on function public.roommate_candidates(integer) to authenticated;
comment on function public.roommate_candidates(integer) is 'The caller''s candidate pool as roommate cards (jsonb), max 200, most recently active first. ZV404 without a profile, ZV409 when the profile is not active, ZV423 when restricted.';

-- ───────────────────────────── swipe + atomic mutual match ─────────────────────────────
-- Records a like or pass. A like answered by an earlier like from the other person creates
-- exactly one match, its conversation (two members and a system greeting) and one notification
-- for each person. A transaction-scoped advisory lock on the ordered pair serialises the two
-- people swiping at the same moment (otherwise each could miss the other's uncommitted like);
-- the unique pair plus ON CONFLICT DO NOTHING makes a duplicate match impossible regardless.
create function public.roommate_swipe(p_target uuid, p_action public.swipe_action)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_a         uuid;
  v_b         uuid;
  v_match     public.roommate_matches;
  v_conv      uuid;
  v_my_name   text;
  v_their_name text;
begin
  if v_uid is null then
    raise exception 'Please sign in to continue.' using errcode = 'ZV401';
  end if;
  if not public.is_active_user() then
    raise exception 'Your account cannot use roommate matching right now.' using errcode = 'ZV423';
  end if;
  if p_target is null or p_action is null then
    raise exception 'Choose a profile and like or pass.' using errcode = 'ZV400';
  end if;
  if p_target = v_uid then
    raise exception 'You cannot swipe on yourself.' using errcode = 'ZV422';
  end if;
  if public.has_active_restriction('matching') then
    raise exception 'Your account cannot use roommate matching right now.' using errcode = 'ZV423';
  end if;
  if not exists (select 1 from public.roommate_profiles where user_id = v_uid and status = 'active') then
    raise exception 'Turn on your roommate profile first.' using errcode = 'ZV409';
  end if;
  if not exists (select 1 from public.roommate_profiles where user_id = p_target and status = 'active')
     or not public.roommate_can_view(p_target) then
    raise exception 'This profile is no longer available.' using errcode = 'ZV404';
  end if;

  if p_action = 'like' then
    if not public.consume_rate_limit('roommate_like', greatest(public.setting_int('max_likes_per_day', 100), 1), 86400) then
      raise exception 'You have used today''s likes. Come back tomorrow.' using errcode = 'ZV429';
    end if;
  elsif not public.consume_rate_limit('roommate_pass', 1000, 86400) then
    raise exception 'You have swiped a lot today. Come back tomorrow.' using errcode = 'ZV429';
  end if;

  v_a := least(v_uid, p_target);
  v_b := greatest(v_uid, p_target);
  perform pg_advisory_xact_lock(hashtextextended('roommate_pair:' || v_a::text || ':' || v_b::text, 0));

  insert into public.roommate_likes (liker_id, liked_id, action)
  values (v_uid, p_target, p_action)
  on conflict (liker_id, liked_id) do update set action = excluded.action;

  update public.roommate_profiles set last_active_at = now() where user_id = v_uid;

  select * into v_match from public.roommate_matches where user_a = v_a and user_b = v_b;
  if found then
    return jsonb_build_object('matched', v_match.status = 'active', 'new_match', false,
                              'match_id', v_match.id, 'conversation_id', v_match.conversation_id);
  end if;

  if p_action <> 'like' or not exists (
    select 1 from public.roommate_likes l where l.liker_id = p_target and l.liked_id = v_uid and l.action = 'like'
  ) then
    return jsonb_build_object('matched', false, 'new_match', false, 'match_id', null, 'conversation_id', null);
  end if;

  insert into public.roommate_matches (user_a, user_b)
  values (v_a, v_b)
  on conflict (user_a, user_b) do nothing
  returning * into v_match;
  if v_match.id is null then
    select * into v_match from public.roommate_matches where user_a = v_a and user_b = v_b;
    return jsonb_build_object('matched', v_match.status = 'active', 'new_match', false,
                              'match_id', v_match.id, 'conversation_id', v_match.conversation_id);
  end if;

  insert into public.conversations (kind, match_id, last_message_at, last_message_preview)
  values ('roommate_match', v_match.id, now(), 'You matched! Say hi.')
  returning id into v_conv;
  insert into public.conversation_members (conversation_id, user_id) values (v_conv, v_a), (v_conv, v_b);
  update public.roommate_matches set conversation_id = v_conv where id = v_match.id;
  insert into public.messages (conversation_id, sender_id, kind, body)
  values (v_conv, null, 'system',
          'You matched! Say hi and get to know each other. Keep the chat on ZUVIO until you have met in person.');

  select coalesce(up.display_name, 'Someone') into v_my_name from public.user_profiles up where up.user_id = v_uid;
  select coalesce(up.display_name, 'Someone') into v_their_name from public.user_profiles up where up.user_id = p_target;
  perform public.notify(p_target, 'roommate_match', 'It''s a match!',
                        'You and ' || coalesce(v_my_name, 'someone') || ' liked each other. Say hi.',
                        '/messages/' || v_conv::text,
                        jsonb_build_object('match_id', v_match.id, 'conversation_id', v_conv));
  perform public.notify(v_uid, 'roommate_match', 'It''s a match!',
                        'You and ' || coalesce(v_their_name, 'someone') || ' liked each other. Say hi.',
                        '/messages/' || v_conv::text,
                        jsonb_build_object('match_id', v_match.id, 'conversation_id', v_conv));

  return jsonb_build_object('matched', true, 'new_match', true, 'match_id', v_match.id, 'conversation_id', v_conv);
end
$$;
revoke all on function public.roommate_swipe(uuid, public.swipe_action) from public, anon, authenticated;
grant execute on function public.roommate_swipe(uuid, public.swipe_action) to authenticated;
comment on function public.roommate_swipe(uuid, public.swipe_action) is 'Like or pass on a visible active profile. Returns {matched, new_match, match_id, conversation_id}; a mutual like creates exactly one match + conversation and notifies both. ZV404 unavailable target, ZV409 own profile not live, ZV423 restricted, ZV429 daily limit.';

-- ───────────────────────────── unmatch ─────────────────────────────
create function public.roommate_unmatch(p_match_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_match public.roommate_matches;
begin
  if v_uid is null then
    raise exception 'Please sign in to continue.' using errcode = 'ZV401';
  end if;
  select * into v_match from public.roommate_matches
  where id = p_match_id and (user_a = v_uid or user_b = v_uid)
  for update;
  if not found then
    raise exception 'Match not found.' using errcode = 'ZV404';
  end if;
  if v_match.status <> 'active' then
    return;
  end if;
  update public.roommate_matches set status = 'unmatched', ended_at = now(), ended_by = v_uid where id = v_match.id;
  update public.conversations set status = 'closed' where match_id = v_match.id and status = 'active';
  if v_match.conversation_id is not null then
    insert into public.messages (conversation_id, sender_id, kind, body)
    values (v_match.conversation_id, null, 'system', 'This match has ended. The chat is closed.');
    update public.conversations set last_message_at = now(), last_message_preview = 'This match has ended.'
    where id = v_match.conversation_id;
  end if;
end
$$;
revoke all on function public.roommate_unmatch(uuid) from public, anon, authenticated;
grant execute on function public.roommate_unmatch(uuid) to authenticated;
comment on function public.roommate_unmatch(uuid) is 'Ends one of the caller''s active matches and closes its chat. Idempotent. ZV404 when the match is not the caller''s.';

-- ───────────────────────────── blocks ─────────────────────────────
-- Blocking only ever affects the caller's own experience, so any existing user may be blocked.
-- It ends an active match between the two (status "blocked") and closes that chat; send_message()
-- refuses messages between blocked people in every conversation kind.
create function public.block_user(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_match public.roommate_matches;
begin
  if v_uid is null then
    raise exception 'Please sign in to continue.' using errcode = 'ZV401';
  end if;
  if p_user_id is null or p_user_id = v_uid then
    raise exception 'You cannot block yourself.' using errcode = 'ZV422';
  end if;
  if not exists (select 1 from public.users u where u.id = p_user_id) then
    raise exception 'User not found.' using errcode = 'ZV404';
  end if;
  if not public.consume_rate_limit('block_user', 50, 86400) then
    raise exception 'You have blocked many people today. Please contact support.' using errcode = 'ZV429';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id) values (v_uid, p_user_id) on conflict do nothing;

  for v_match in
    select * from public.roommate_matches
    where user_a = least(v_uid, p_user_id) and user_b = greatest(v_uid, p_user_id) and status = 'active'
    for update
  loop
    update public.roommate_matches set status = 'blocked', ended_at = now(), ended_by = v_uid where id = v_match.id;
    update public.conversations set status = 'closed' where match_id = v_match.id;
  end loop;
end
$$;
revoke all on function public.block_user(uuid) from public, anon, authenticated;
grant execute on function public.block_user(uuid) to authenticated;
comment on function public.block_user(uuid) is 'The caller blocks a user: no more candidates, swipes or messages either way; an active match ends as "blocked". Idempotent.';

create function public.unblock_user(p_user_id uuid)
returns void
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
  delete from public.user_blocks where blocker_id = v_uid and blocked_id = p_user_id;
end
$$;
revoke all on function public.unblock_user(uuid) from public, anon, authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
comment on function public.unblock_user(uuid) is 'Removes the caller''s block on a user. An ended match stays ended. Idempotent.';
