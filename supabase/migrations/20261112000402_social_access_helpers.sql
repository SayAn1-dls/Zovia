-- ZUVIO stage 4 / 02 — identity helpers for the roommate, messaging and moderation policies.
--
-- Same rules as stage 1 / 04: STABLE SECURITY DEFINER, empty search_path, the subject is always
-- auth.uid(). The helpers referenced by policies are executable by "authenticated" (a policy is
-- evaluated with the caller's privileges); calling them through the API only reveals facts about
-- the caller's own relationships. is_blocked_pair() takes two ids and is internal only.

-- Internal: true when either user has blocked the other.
create function public.is_blocked_pair(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  )
$$;
revoke all on function public.is_blocked_pair(uuid, uuid) from public, anon, authenticated;
comment on function public.is_blocked_pair(uuid, uuid) is 'Internal (not API-callable): true when either user has blocked the other.';

-- Caller is a current member of the conversation.
create function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = (select auth.uid())
      and m.left_at is null
  )
$$;
revoke all on function public.is_conversation_member(uuid) from public, anon, authenticated;
grant execute on function public.is_conversation_member(uuid) to authenticated, service_role;
comment on function public.is_conversation_member(uuid) is 'True when the caller is a current member of the conversation.';

-- Caller shares any conversation with the user (for the user_profiles policy).
create function public.shares_conversation_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members mine
    join public.conversation_members theirs on theirs.conversation_id = mine.conversation_id
    where mine.user_id = (select auth.uid())
      and mine.left_at is null
      and theirs.user_id = p_user_id
      and theirs.user_id <> mine.user_id
  )
$$;
revoke all on function public.shares_conversation_with(uuid) from public, anon, authenticated;
grant execute on function public.shares_conversation_with(uuid) to authenticated, service_role;
comment on function public.shares_conversation_with(uuid) is 'True when the caller shares a conversation with the user.';

-- Realtime Broadcast topics are "conversation:<uuid>"; only members may join them.
create function public.can_access_conversation_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_topic is null or p_topic !~ '^conversation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_conversation_member(substr(p_topic, 14)::uuid);
end
$$;
revoke all on function public.can_access_conversation_topic(text) from public, anon, authenticated;
grant execute on function public.can_access_conversation_topic(text) to authenticated, service_role;
comment on function public.can_access_conversation_topic(text) is 'True when the topic is "conversation:<id>" and the caller is a member of that conversation (Realtime Broadcast authorisation).';

-- Who may see a roommate profile (and its photos / place): the owner, staff, and — when nobody
-- blocked anybody and the target account is usable — either an active profile seen by someone with
-- an active profile, or the other person of an active match.
create function public.roommate_can_view(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id = (select auth.uid())
    or public.is_staff()
    or (
      public.is_active_user()
      and not public.is_blocked_pair((select auth.uid()), p_user_id)
      and exists (select 1 from public.users u
                  where u.id = p_user_id and u.status in ('active', 'restricted') and u.deleted_at is null)
      and (
        (exists (select 1 from public.roommate_profiles t where t.user_id = p_user_id and t.status = 'active')
         and exists (select 1 from public.roommate_profiles m where m.user_id = (select auth.uid()) and m.status = 'active'))
        or exists (select 1 from public.roommate_matches x
                   where x.user_a = least((select auth.uid()), p_user_id)
                     and x.user_b = greatest((select auth.uid()), p_user_id)
                     and x.status = 'active')
      )
    )
$$;
revoke all on function public.roommate_can_view(uuid) from public, anon, authenticated;
grant execute on function public.roommate_can_view(uuid) to authenticated, service_role;
comment on function public.roommate_can_view(uuid) is 'True when the caller may see this person''s roommate profile, photos and place.';
