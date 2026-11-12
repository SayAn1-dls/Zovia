-- ZUVIO stage 1 / 08 — keep public.users in step with auth.users.
--
-- Sign-up: an AFTER INSERT trigger on auth.users creates the users row, the profile, the
-- preferences and the "seeker" role. The ONLY metadata read is a display name (full_name, else
-- name) and it is sanitised by clean_display_name(). Nothing else in raw_user_meta_data is
-- trusted — it is written by the client at sign-up. In particular a "role" there is ignored.
--
-- Robustness: sign-up must not fail because of odd input. The name is cleaned inside its own
-- exception block; if the normal inserts still fail for any reason the trigger retries with
-- nothing but the id and defaults. Only if that fails too does the error propagate, because an
-- auth user without a users row would be a broken account that fails silently everywhere else.
--
-- The functions are SECURITY DEFINER (they run as the Auth service role, which has no rights on
-- schema public) and are not executable through the API.

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  begin
    if jsonb_typeof(new.raw_user_meta_data -> 'full_name') = 'string' then
      v_name := public.clean_display_name(new.raw_user_meta_data ->> 'full_name');
    end if;
    if v_name is null and jsonb_typeof(new.raw_user_meta_data -> 'name') = 'string' then
      v_name := public.clean_display_name(new.raw_user_meta_data ->> 'name');
    end if;
  exception when others then
    v_name := null;
  end;

  begin
    insert into public.users (id, email, phone, phone_verified_at)
    values (new.id, nullif(btrim(new.email), ''), nullif(btrim(new.phone), ''),
            case when nullif(btrim(new.phone), '') is not null then new.phone_confirmed_at end)
    on conflict (id) do nothing;

    insert into public.user_profiles (user_id, display_name)
    values (new.id, coalesce(v_name, 'New member'))
    on conflict (user_id) do nothing;
  exception when others then
    raise warning 'handle_new_auth_user: falling back to defaults for % (%)', new.id, sqlerrm;
    insert into public.users (id) values (new.id) on conflict (id) do nothing;
    insert into public.user_profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  end;

  insert into public.user_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'seeker') on conflict (user_id, role) do nothing;
  return new;
end
$$;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
comment on function public.handle_new_auth_user() is 'Trigger on auth.users insert: creates users, user_profiles, user_preferences and the seeker role. Reads only a sanitised display name from sign-up metadata.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- E-mail / phone changes (confirmed e-mail change, phone verification, admin edits).
-- A failure here is logged and swallowed: it must never block signing in or changing an address.
create function public.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    update public.users u
    set email = nullif(btrim(new.email), ''),
        phone = nullif(btrim(new.phone), ''),
        phone_verified_at = case when nullif(btrim(new.phone), '') is not null then new.phone_confirmed_at end
    where u.id = new.id;
  exception when others then
    raise warning 'handle_auth_user_updated: could not sync % (%)', new.id, sqlerrm;
  end;
  return new;
end
$$;
revoke all on function public.handle_auth_user_updated() from public, anon, authenticated;
comment on function public.handle_auth_user_updated() is 'Trigger on auth.users update of email/phone: mirrors them into public.users.';

create trigger on_auth_user_contact_changed
  after update of email, phone, phone_confirmed_at on auth.users
  for each row
  when (old.email is distinct from new.email
        or old.phone is distinct from new.phone
        or old.phone_confirmed_at is distinct from new.phone_confirmed_at)
  execute function public.handle_auth_user_updated();
