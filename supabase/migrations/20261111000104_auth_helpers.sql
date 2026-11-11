-- ZUVIO stage 1 / 04 — identity helpers used inside RLS policies and functions.
--
-- All are STABLE SECURITY DEFINER with an empty search_path: they must read users / user_roles /
-- user_restrictions regardless of the caller's own RLS (and without recursing into the policies
-- that call them). They take no user id: the subject is always auth.uid(), so calling them through
-- the API reveals nothing but facts about the caller.
-- In policies always wrap them: (select public.is_staff()) — evaluated once per statement.

create function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.status in ('active', 'restricted')
      and u.deleted_at is null
  )
$$;
comment on function public.is_active_user() is 'True when the caller is signed in and their account is active or restricted (not suspended, not deleted).';

create function public.has_role(p_role public.user_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles r
    join public.users u on u.id = r.user_id
    where r.user_id = (select auth.uid())
      and r.role = p_role
      and u.status in ('active', 'restricted')
      and u.deleted_at is null
  )
$$;
comment on function public.has_role(public.user_role) is 'True when the caller holds the role AND their account is active or restricted. A suspended or deleted account holds no roles.';

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin'::public.user_role)
$$;
comment on function public.is_admin() is 'True when the caller is an admin with a usable account.';

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles r
    join public.users u on u.id = r.user_id
    where r.user_id = (select auth.uid())
      and r.role in ('admin', 'moderator')
      and u.status in ('active', 'restricted')
      and u.deleted_at is null
  )
$$;
comment on function public.is_staff() is 'True when the caller is an admin or a moderator with a usable account.';

create function public.has_active_restriction(p_kind public.restriction_kind)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_restrictions r
    where r.user_id = (select auth.uid())
      and r.lifted_at is null
      and r.starts_at <= now()
      and (r.ends_at is null or r.ends_at > now())
      and (r.kind = p_kind or r.kind = 'all')
  )
$$;
comment on function public.has_active_restriction(public.restriction_kind) is 'True when the caller currently has a restriction of this kind, or an "all" restriction.';

revoke all on function public.is_active_user() from public, anon, authenticated;
revoke all on function public.has_role(public.user_role) from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.is_staff() from public, anon, authenticated;
revoke all on function public.has_active_restriction(public.restriction_kind) from public, anon, authenticated;

-- Granted to anon as well: a policy written "to anon" may reference them (they return false).
grant execute on function public.is_active_user() to anon, authenticated, service_role;
grant execute on function public.has_role(public.user_role) to anon, authenticated, service_role;
grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.is_staff() to anon, authenticated, service_role;
grant execute on function public.has_active_restriction(public.restriction_kind) to anon, authenticated, service_role;
