-- ZUVIO stage 4 / 06 — Realtime publication, Broadcast authorisation and private storage buckets.

-- ───────────────────────────── Realtime: Postgres changes ─────────────────────────────
-- Subscribers receive only rows their RLS select policies allow (spec 6.4).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;
alter publication supabase_realtime add table public.messages, public.conversation_members, public.conversations, public.notifications;

-- ───────────────────────────── Realtime: Broadcast (typing indicators) ─────────────────────────────
-- Private channels "conversation:<id>": only current members may receive or send.
create policy conversation_topic_members_receive on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast'
         and public.can_access_conversation_topic((select realtime.topic())));

create policy conversation_topic_members_send on realtime.messages
  for insert to authenticated
  with check (realtime.messages.extension = 'broadcast'
              and public.can_access_conversation_topic((select realtime.topic())));

-- ───────────────────────────── storage buckets ─────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('roommate-photos', 'roommate-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
       ('chat-attachments', 'chat-attachments', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- roommate-photos/<user_id>/<file>: the user writes; readers are the user and people allowed to
-- see that roommate profile (roommate_can_view) — served through short-lived signed URLs.
create policy roommate_photos_own_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'roommate-photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select public.is_active_user()));

create policy roommate_photos_own_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'roommate-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy roommate_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'roommate-photos'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or (case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       then public.roommate_can_view(((storage.foldername(name))[1])::uuid)
                       else false end)));

-- chat-attachments/<conversation_id>/<user_id>/<file>: members upload into their own sub-folder of
-- an active conversation; every member reads.
create policy chat_attachments_member_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-attachments'
              and (storage.foldername(name))[2] = (select auth.uid())::text
              and (case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        then public.is_conversation_member(((storage.foldername(name))[1])::uuid)
                        else false end));

create policy chat_attachments_member_select on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-attachments'
         and (case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   then public.is_conversation_member(((storage.foldername(name))[1])::uuid)
                   else false end));
