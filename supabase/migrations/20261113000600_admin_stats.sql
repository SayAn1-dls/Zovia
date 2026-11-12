-- Admin dashboard analytics: aggregate counts only (no rows, no personal data).
-- SECURITY DEFINER because staff RLS deliberately does not expose every table (e.g. private
-- messages, AI usage logs); the function re-checks is_staff() and returns numbers only.
-- Day boundaries are Asia/Kolkata (the platform's market).

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz constant text := 'Asia/Kolkata';
  today date := (now() at time zone tz)::date;
  result jsonb;
begin
  if not public.is_staff() then
    raise exception using errcode = 'ZV403', message = 'Only staff can view platform analytics.';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'users_total', (select count(*) from public.users u where u.deleted_at is null),
    'users_new_today', (select count(*) from public.users u
                          where u.deleted_at is null and (u.created_at at time zone tz)::date = today),
    'users_new_7d', (select count(*) from public.users u
                       where u.deleted_at is null and (u.created_at at time zone tz)::date > today - 7),
    'users_new_30d', (select count(*) from public.users u
                        where u.deleted_at is null and (u.created_at at time zone tz)::date > today - 30),
    'signups_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
      from generate_series(today - 29, today, interval '1 day') as d(day)
      left join (
        select (u.created_at at time zone tz)::date as day, count(*) as n
        from public.users u
        where u.deleted_at is null and (u.created_at at time zone tz)::date > today - 30
        group by 1
      ) c on c.day = d.day::date
    ),
    'owners', (select count(*) from public.property_owners),
    'listings_by_status', (
      select coalesce(jsonb_object_agg(p.status, p.n), '{}'::jsonb)
      from (select status, count(*) as n from public.properties where deleted_at is null group by status) p
    ),
    'bookings_by_status', (
      select coalesce(jsonb_object_agg(b.status, b.n), '{}'::jsonb)
      from (select status, count(*) as n from public.bookings group by status) b
    ),
    'roommate_profiles', (select count(*) from public.roommate_profiles),
    'roommate_profiles_active', (select count(*) from public.roommate_profiles where status = 'active'),
    'matches', (select count(*) from public.roommate_matches),
    'messages_7d', (select count(*) from public.messages m
                      where m.deleted_at is null and m.created_at > now() - interval '7 days'),
    'contact_messages_new', (select count(*) from public.contact_messages where status = 'new'),
    'ai_calls_7d', (select count(*) from public.ai_usage_logs a where a.created_at > now() - interval '7 days')
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;
