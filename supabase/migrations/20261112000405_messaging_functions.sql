-- ZUVIO stage 4 / 05 — messaging and moderation functions (spec 6.4, 6.5).

-- ───────────────────────────── contact detection ─────────────────────────────
-- Conservative detector for contact details in roommate chats. Returns
-- {"detected": bool, "kinds": ["phone" | "email" | "social", ...]}; never the matched text.
--
-- phone   Runs of digits joined by spaces, dots, dashes or brackets (spelled-out digits are
--         turned into digits first). Consecutive groups of a run are joined and the result must
--         be exactly an Indian mobile number: [6-9]xxxxxxxxx, 0 + that, or 91 + that. So
--         "98765 43210" and "nine eight seven ..." are caught, while rents ("₹8,500", "8500 17000"),
--         dates ("12-12-2026"), PIN codes ("560034") and years are not.
-- email   Real addresses, "name (at) domain (dot) com", "name at gmail dot com", "name@gmail",
--         "email id: name.123".
-- social  WhatsApp / Telegram / Instagram / Snapchat / Facebook links, and a platform name followed
--         by something handle-shaped (@name, name.with.dot, name_1, name123). A bare platform name
--         ("do you use WhatsApp?") is fine.
create function public.detect_contact_info(p_body text)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  c_platform constant text := '(insta|instagram|ig|snap|snapchat|telegram|tg|whatsapp|whats app|watsapp|whatsap|wa|fb|facebook)';
  c_handle   constant text := '(@[a-z0-9._]{3,30}|[a-z0-9]+[._][a-z0-9._]+|[a-z]+[0-9]+[a-z0-9._]*)';
  c_provider constant text := '(gmail|googlemail|yahoo|ymail|outlook|hotmail|icloud|rediffmail|rediff|protonmail|proton|zoho|aol)';
  v_text   text;
  v_kinds  text[] := '{}';
  v_run    text;
  v_groups text[];
  v_acc    text;
  v_digits text;
  v_n      integer;
begin
  v_text := lower(coalesce(p_body, ''));
  if btrim(v_text) = '' then
    return jsonb_build_object('detected', false, 'kinds', '[]'::jsonb);
  end if;
  v_text := translate(v_text, '０１２３４５６７８９＠．', '0123456789@.');

  -- spelled-out digits (whole words only)
  v_text := regexp_replace(v_text, '\mzero\M', '0', 'g');
  v_text := regexp_replace(v_text, '\mone\M', '1', 'g');
  v_text := regexp_replace(v_text, '\mtwo\M', '2', 'g');
  v_text := regexp_replace(v_text, '\mthree\M', '3', 'g');
  v_text := regexp_replace(v_text, '\mfour\M', '4', 'g');
  v_text := regexp_replace(v_text, '\mfive\M', '5', 'g');
  v_text := regexp_replace(v_text, '\msix\M', '6', 'g');
  v_text := regexp_replace(v_text, '\mseven\M', '7', 'g');
  v_text := regexp_replace(v_text, '\meight\M', '8', 'g');
  v_text := regexp_replace(v_text, '\mnine\M', '9', 'g');

  -- phone numbers
  <<runs>>
  for v_run in select m[1] from regexp_matches(v_text, '(\+?[0-9][0-9().[:space:]-]*[0-9])', 'g') as m loop
    v_groups := array_remove(regexp_split_to_array(v_run, '[^0-9]+'), '');
    v_n := coalesce(array_length(v_groups, 1), 0);
    v_digits := array_to_string(v_groups, '');
    if left(v_run, 1) = '+' and length(v_digits) between 10 and 13 then
      v_kinds := v_kinds || 'phone'::text;
      exit runs;
    end if;
    for i in 1..v_n loop
      v_acc := '';
      for j in i..v_n loop
        v_acc := v_acc || v_groups[j];
        exit when length(v_acc) > 12;
        if v_acc ~ '^(?:[6-9][0-9]{9}|0[6-9][0-9]{9}|91[6-9][0-9]{9})$' then
          v_kinds := v_kinds || 'phone'::text;
          exit runs;
        end if;
      end loop;
    end loop;
  end loop;

  -- e-mail addresses
  if v_text ~ '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+'
     or v_text ~ ('[a-z0-9._%+-]+[[:space:]]*(\(at\)|\[at\]|\{at\}|@)[[:space:]]*' || c_provider || '\M')
     or v_text ~ ('[a-z0-9._%+-]+[[:space:]]+at[[:space:]]+' || c_provider || '[[:space:]]*(\.|dot|\(dot\)|\[dot\])[[:space:]]*(com|in|co)\M')
     or v_text ~ ('([a-z]+[0-9]+[a-z0-9._]*|[a-z0-9]+[._][a-z0-9._]+)[[:space:]]+at[[:space:]]+' || c_provider || '\M')
     or v_text ~ '[a-z0-9._%+-]+[[:space:]]*(\(at\)|\[at\]|\{at\})[[:space:]]*[a-z0-9-]+[[:space:]]*(\(dot\)|\[dot\]|\{dot\}|[[:space:]]dot[[:space:]]|\.)[[:space:]]*[a-z]{2,}'
     or v_text ~ '\m(gmail|email|e-mail|mail)[[:space:]]*(id|address)?[[:space:]]*(is|:|=|-)[[:space:]]*([a-z0-9]+[._][a-z0-9._]+|[a-z]+[0-9]+[a-z0-9._]*)'
  then
    v_kinds := v_kinds || 'email'::text;
  end if;

  -- social links and handles
  if v_text ~ '(wa\.me|whatsapp\.com|chat\.whatsapp|t\.me/|telegram\.(me|org|dog)|instagram\.com|instagr\.am|snapchat\.com|snap\.com|facebook\.com|fb\.com|fb\.me|m\.me/)'
     or v_text ~ ('\m' || c_platform || '\M[[:space:]]*(id|handle|username|user name)[[:space:]]*(is|:|-|=)?[[:space:]]*@?[a-z0-9][a-z0-9._]{2,}')
     or v_text ~ ('\m' || c_platform || '\M[[:space:]]*(is|:|-|=)?[[:space:]]*' || c_handle)
     or v_text ~ ('@[a-z0-9._]{3,30}[[:space:]]+(on|at)[[:space:]]+' || c_platform || '\M')
  then
    v_kinds := v_kinds || 'social'::text;
  end if;

  return jsonb_build_object('detected', cardinality(v_kinds) > 0, 'kinds', to_jsonb(v_kinds));
end
$$;
revoke all on function public.detect_contact_info(text) from public, anon, authenticated;
grant execute on function public.detect_contact_info(text) to authenticated, service_role;
comment on function public.detect_contact_info(text) is 'Pure: {detected, kinds[]} for phone numbers (incl. spaced / spelled digits), e-mail addresses (incl. at/dot obfuscation) and WhatsApp/Telegram/Instagram/Snapchat links and handles. Conservative: rents, dates, PIN codes and plain platform names do not trigger.';

-- ───────────────────────────── send_message ─────────────────────────────
-- The only way to write a message. Returns
--   {"status": "sent", "message": {...}}                       delivered
--   {"status": "blocked", "kinds": [...], "violations": n,     contact details in a roommate chat:
--    "threshold": t, "restricted": bool, "message": null}      NOT delivered, violation recorded
-- A blocked send returns normally (no exception) so the violation row and any automatic
-- restriction commit. Owner enquiry conversations are exempt from contact detection.
create function public.send_message(p_conversation_id uuid, p_body text, p_attachment jsonb default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_conv       public.conversations;
  v_body       text;
  v_detect     jsonb;
  v_count      integer;
  v_threshold  integer;
  v_window     integer;
  v_hours      integer;
  v_action     uuid;
  v_restricted boolean := false;
  v_msg        public.messages;
  v_preview    text;
  v_sender     text;
  v_seeker     uuid;
  v_member     uuid;
  v_path       text;
  v_object     record;
  v_att        jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Please sign in to continue.' using errcode = 'ZV401';
  end if;
  if not public.is_active_user() then
    raise exception 'Your account cannot send messages right now.' using errcode = 'ZV423';
  end if;
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found or not exists (select 1 from public.conversation_members m
                              where m.conversation_id = v_conv.id and m.user_id = v_uid and m.left_at is null) then
    raise exception 'Conversation not found.' using errcode = 'ZV404';
  end if;
  if v_conv.status <> 'active' then
    raise exception 'This conversation has ended.' using errcode = 'ZV409';
  end if;
  if exists (select 1 from public.conversation_members m
             where m.conversation_id = v_conv.id and m.user_id <> v_uid and public.is_blocked_pair(v_uid, m.user_id)) then
    raise exception 'You can no longer message this person.' using errcode = 'ZV403';
  end if;
  if public.has_active_restriction('messaging') then
    raise exception 'Messaging is paused on your account for now. You can appeal this decision.' using errcode = 'ZV423';
  end if;

  v_body := btrim(regexp_replace(coalesce(p_body, ''), '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]', '', 'g'));
  if p_attachment is null and char_length(v_body) = 0 then
    raise exception 'Write a message first.' using errcode = 'ZV422';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Messages can be up to 2,000 characters.' using errcode = 'ZV422';
  end if;
  if not public.consume_rate_limit('message_send', greatest(public.setting_int('max_messages_per_minute', 20), 1), 60) then
    raise exception 'You are sending messages very fast. Please wait a moment.' using errcode = 'ZV429';
  end if;

  if v_conv.kind = 'roommate_match' and char_length(v_body) > 0 then
    v_detect := public.detect_contact_info(v_body);
    if (v_detect ->> 'detected')::boolean then
      insert into public.user_violations (user_id, kind, conversation_id, detected)
      values (v_uid, 'contact_sharing', v_conv.id,
              jsonb_build_object('kinds', v_detect -> 'kinds', 'length', char_length(v_body)));
      v_window := greatest(public.setting_int('contact_violation_window_days', 30), 1);
      v_threshold := greatest(public.setting_int('contact_violations_before_restriction', 3), 2);
      v_hours := greatest(public.setting_int('messaging_restriction_hours', 24), 1);
      select count(*) into v_count from public.user_violations uv
      where uv.user_id = v_uid and uv.kind = 'contact_sharing' and uv.created_at > now() - make_interval(days => v_window);

      if v_count >= v_threshold then
        insert into public.moderation_actions (actor_id, target_user_id, action, reason, expires_at)
        values (null, v_uid, 'restrict', 'Repeatedly shared contact details in roommate chats (automatic).',
                now() + make_interval(hours => v_hours))
        returning id into v_action;
        insert into public.user_restrictions (user_id, kind, reason, moderation_action_id, ends_at, created_by)
        values (v_uid, 'messaging', 'Repeatedly shared contact details in roommate chats.', v_action,
                now() + make_interval(hours => v_hours), null);
        perform public.notify(v_uid, 'restriction_applied', 'Messaging paused for ' || v_hours || ' hours',
                              'Contact details were shared in roommate chats several times. You can appeal this decision.',
                              null, jsonb_build_object('moderation_action_id', v_action));
        v_restricted := true;
      elsif v_count = 1 then
        perform public.notify(v_uid, 'contact_warning', 'Message not sent',
                              'For everyone''s safety, phone numbers, e-mail addresses and social handles cannot be shared in roommate chats.',
                              '/messages/' || v_conv.id::text, jsonb_build_object('conversation_id', v_conv.id));
      end if;

      return jsonb_build_object('status', 'blocked', 'kinds', v_detect -> 'kinds', 'violations', v_count,
                                'threshold', v_threshold, 'restricted', v_restricted, 'message', null);
    end if;
  end if;

  -- attachment: must already be uploaded to this conversation's folder by the sender; size and
  -- type come from the stored object, never from the client.
  if p_attachment is not null then
    v_path := case when jsonb_typeof(p_attachment) = 'object' then p_attachment ->> 'storage_path' end;
    if v_path is null or v_path not like v_conv.id::text || '/' || v_uid::text || '/%' or v_path ~ '(\.\.|//)' then
      raise exception 'That attachment is not valid.' using errcode = 'ZV422';
    end if;
    select o.name, o.metadata into v_object from storage.objects o where o.bucket_id = 'chat-attachments' and o.name = v_path;
    if not found then
      raise exception 'Upload the image first.' using errcode = 'ZV422';
    end if;
  end if;

  insert into public.messages (conversation_id, sender_id, kind, body)
  values (v_conv.id, v_uid, case when p_attachment is null then 'text' else 'image' end::public.message_kind, v_body)
  returning * into v_msg;

  if p_attachment is not null then
    insert into public.message_attachments (message_id, storage_path, mime_type, size_bytes, width, height)
    values (v_msg.id, v_path, coalesce(v_object.metadata ->> 'mimetype', 'image/webp'),
            greatest(coalesce((v_object.metadata ->> 'size')::integer, 1), 1),
            nullif(least(greatest(coalesce((p_attachment ->> 'width')::integer, 0), 0), 10000), 0),
            nullif(least(greatest(coalesce((p_attachment ->> 'height')::integer, 0), 0), 10000), 0));
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'storage_path', a.storage_path, 'mime_type', a.mime_type,
                                                  'width', a.width, 'height', a.height)), '[]'::jsonb)
      into v_att from public.message_attachments a where a.message_id = v_msg.id;
  end if;

  v_preview := case when char_length(v_body) > 0 then left(regexp_replace(v_body, '\s+', ' ', 'g'), 140) else 'Sent a photo' end;
  update public.conversations set last_message_at = v_msg.created_at, last_message_preview = v_preview where id = v_conv.id;
  update public.conversation_members set last_read_at = v_msg.created_at
  where conversation_id = v_conv.id and user_id = v_uid;

  -- an owner's first reply marks the enquiry as responded
  if v_conv.kind = 'property_inquiry' then
    update public.property_inquiries i
    set status = 'responded', owner_responded_at = coalesce(i.owner_responded_at, now())
    where i.id = v_conv.inquiry_id and i.status = 'new'
      and exists (select 1 from public.properties p where p.id = i.property_id and p.owner_id = v_uid)
    returning i.seeker_id into v_seeker;
    if v_seeker is not null then
      perform public.notify(v_seeker, 'inquiry_responded', 'The owner replied', v_preview,
                            '/messages/' || v_conv.id::text, jsonb_build_object('conversation_id', v_conv.id));
    end if;
  end if;

  -- one unread "new message" notification per conversation per person (no notification storm)
  select up.display_name into v_sender from public.user_profiles up where up.user_id = v_uid;
  for v_member in
    select m.user_id from public.conversation_members m
    where m.conversation_id = v_conv.id and m.user_id <> v_uid and m.left_at is null and not m.muted
      and (v_seeker is null or m.user_id <> v_seeker)
  loop
    if not exists (select 1 from public.notifications n
                   where n.user_id = v_member and n.type = 'new_message' and n.read_at is null
                     and n.data ->> 'conversation_id' = v_conv.id::text) then
      perform public.notify(v_member, 'new_message', 'New message from ' || coalesce(v_sender, 'someone'), v_preview,
                            '/messages/' || v_conv.id::text, jsonb_build_object('conversation_id', v_conv.id));
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'sent', 'kinds', '[]'::jsonb, 'restricted', false,
    'message', jsonb_build_object('id', v_msg.id, 'conversation_id', v_msg.conversation_id, 'sender_id', v_msg.sender_id,
                                  'kind', v_msg.kind, 'body', v_msg.body, 'moderation', v_msg.moderation,
                                  'created_at', v_msg.created_at, 'edited_at', v_msg.edited_at,
                                  'deleted_at', v_msg.deleted_at, 'attachments', v_att));
end
$$;
revoke all on function public.send_message(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.send_message(uuid, text, jsonb) to authenticated;
comment on function public.send_message(uuid, text, jsonb) is 'Sends a message as the caller after checking membership, conversation state, blocks, restrictions and the per-minute cap; in roommate chats contact details are detected and the message is not delivered (status "blocked", violation recorded, escalation per platform_settings). p_attachment = {storage_path, width?, height?} of an object already uploaded to chat-attachments/<conversation_id>/<uid>/.';

-- ───────────────────────────── read receipts ─────────────────────────────
create function public.mark_conversation_read(p_conversation_id uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_at  timestamptz;
begin
  if v_uid is null then
    raise exception 'Please sign in to continue.' using errcode = 'ZV401';
  end if;
  update public.conversation_members m
  set last_read_at = greatest(coalesce(m.last_read_at, '-infinity'::timestamptz), now())
  where m.conversation_id = p_conversation_id and m.user_id = v_uid and m.left_at is null
  returning m.last_read_at into v_at;
  if v_at is null then
    raise exception 'Conversation not found.' using errcode = 'ZV404';
  end if;
  update public.notifications n set read_at = now()
  where n.user_id = v_uid and n.read_at is null and n.type in ('new_message', 'roommate_match', 'inquiry_responded')
    and n.data ->> 'conversation_id' = p_conversation_id::text;
  return v_at;
end
$$;
revoke all on function public.mark_conversation_read(uuid) from public, anon, authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
comment on function public.mark_conversation_read(uuid) is 'Sets the caller''s last_read_at in the conversation to now (read receipts) and marks its chat notifications read. Returns the timestamp. ZV404 when not a member.';

-- ───────────────────────────── enquiry conversations ─────────────────────────────
-- Opens (or returns) the chat between a seeker and the owner about one enquiry. The enquiry text
-- becomes the first message. Exempt from contact detection (spec 6.4).
create function public.start_inquiry_conversation(p_inquiry_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_inquiry public.property_inquiries;
  v_owner   uuid;
  v_conv    uuid;
  v_preview text;
begin
  if v_uid is null then
    raise exception 'Please sign in to continue.' using errcode = 'ZV401';
  end if;
  select i.* into v_inquiry from public.property_inquiries i where i.id = p_inquiry_id;
  if found then
    select p.owner_id into v_owner from public.properties p where p.id = v_inquiry.property_id;
  end if;
  if v_inquiry.id is null or (v_uid <> v_inquiry.seeker_id and v_uid is distinct from v_owner) then
    raise exception 'Enquiry not found.' using errcode = 'ZV404';
  end if;
  if not public.is_active_user() then
    raise exception 'Your account cannot send messages right now.' using errcode = 'ZV423';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('inquiry_conversation:' || p_inquiry_id::text, 0));
  select c.id into v_conv from public.conversations c where c.inquiry_id = p_inquiry_id;
  if v_conv is not null then
    return v_conv;
  end if;
  if public.is_blocked_pair(v_inquiry.seeker_id, v_owner) then
    raise exception 'You can no longer message this person.' using errcode = 'ZV403';
  end if;

  v_preview := left(regexp_replace(v_inquiry.message, '\s+', ' ', 'g'), 140);
  insert into public.conversations (kind, inquiry_id, property_id, last_message_at, last_message_preview)
  values ('property_inquiry', v_inquiry.id, v_inquiry.property_id, v_inquiry.created_at, v_preview)
  returning id into v_conv;
  insert into public.conversation_members (conversation_id, user_id, role, last_read_at)
  values (v_conv, v_inquiry.seeker_id, 'seeker', v_inquiry.created_at),
         (v_conv, v_owner, 'owner', null);
  insert into public.messages (conversation_id, sender_id, kind, body, created_at)
  values (v_conv, v_inquiry.seeker_id, 'text', left(v_inquiry.message, 2000), v_inquiry.created_at);
  update public.property_inquiries set conversation_id = v_conv where id = v_inquiry.id;
  return v_conv;
end
$$;
revoke all on function public.start_inquiry_conversation(uuid) from public, anon, authenticated;
grant execute on function public.start_inquiry_conversation(uuid) to authenticated;
comment on function public.start_inquiry_conversation(uuid) is 'For the seeker or the property owner of an enquiry: returns its conversation, creating it on first use (members: seeker + owner; first message = the enquiry text). ZV404 for anyone else, ZV403 when blocked.';

-- ───────────────────────────── conversation list ─────────────────────────────
-- SECURITY INVOKER: RLS decides what the caller sees.
create function public.my_conversations(p_limit integer default 30, p_offset integer default 0)
returns table (
  id                   uuid,
  kind                 public.conversation_kind,
  status               public.conversation_status,
  match_id             uuid,
  inquiry_id           uuid,
  property_id          uuid,
  property_title       text,
  last_message_at      timestamptz,
  last_message_preview text,
  created_at           timestamptz,
  other_user_id        uuid,
  other_display_name   text,
  other_avatar_path    text,
  my_role              text,
  last_read_at         timestamptz,
  muted                boolean,
  unread_count         integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.kind, c.status, c.match_id, c.inquiry_id, c.property_id,
         (select pr.title from public.properties pr where pr.id = c.property_id),
         c.last_message_at, c.last_message_preview, c.created_at,
         o.user_id, card.display_name, card.avatar_path,
         me.role, me.last_read_at, me.muted,
         (select count(*)::integer from public.messages m
          where m.conversation_id = c.id and m.deleted_at is null
            and m.sender_id is distinct from me.user_id
            and m.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz))
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join lateral (
    select om.user_id from public.conversation_members om
    where om.conversation_id = c.id and om.user_id <> me.user_id
    order by om.joined_at limit 1
  ) o on true
  left join public.public_user_cards card on card.user_id = o.user_id
  where me.user_id = (select auth.uid()) and me.left_at is null
  order by coalesce(c.last_message_at, c.created_at) desc, c.id
  limit least(greatest(coalesce(p_limit, 30), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;
revoke all on function public.my_conversations(integer, integer) from public, anon, authenticated;
grant execute on function public.my_conversations(integer, integer) to authenticated;
comment on function public.my_conversations(integer, integer) is 'The caller''s conversations, newest activity first, with the other person''s public card, unread count and (for enquiries) the listing title when visible. SECURITY INVOKER.';

-- ───────────────────────────── reports ─────────────────────────────
create function public.report_message(p_message_id uuid, p_reason text, p_details text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_msg     public.messages;
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'Please sign in to continue.' using errcode = 'ZV401';
  end if;
  select * into v_msg from public.messages m where m.id = p_message_id and m.deleted_at is null;
  if not found or not public.is_conversation_member(v_msg.conversation_id) then
    raise exception 'Message not found.' using errcode = 'ZV404';
  end if;
  if v_msg.sender_id is null or v_msg.sender_id = v_uid then
    raise exception 'You can only report messages from other people.' using errcode = 'ZV422';
  end if;
  if p_reason is null or p_reason not in ('spam', 'harassment', 'inappropriate', 'scam', 'contact_sharing', 'fake_profile', 'other') then
    raise exception 'Choose a reason.' using errcode = 'ZV422';
  end if;
  if v_details is not null and char_length(v_details) > 1000 then
    raise exception 'Details can be up to 1,000 characters.' using errcode = 'ZV422';
  end if;
  select r.id into v_id from public.message_reports r where r.message_id = p_message_id and r.reporter_id = v_uid;
  if v_id is not null then
    return v_id;
  end if;
  if not public.consume_rate_limit('report', greatest(public.setting_int('max_reports_per_day', 20), 1), 86400) then
    raise exception 'You have sent many reports today. Please try again tomorrow.' using errcode = 'ZV429';
  end if;

  insert into public.message_reports (message_id, conversation_id, reporter_id, reported_user_id, reason, details, snapshot)
  values (v_msg.id, v_msg.conversation_id, v_uid, v_msg.sender_id, p_reason, v_details,
          jsonb_build_object('body', v_msg.body, 'kind', v_msg.kind, 'sender_id', v_msg.sender_id,
                             'created_at', v_msg.created_at))
  on conflict (message_id, reporter_id) where message_id is not null and reporter_id is not null do nothing
  returning id into v_id;
  if v_id is null then
    select r.id into v_id from public.message_reports r where r.message_id = p_message_id and r.reporter_id = v_uid;
  end if;
  update public.messages set moderation = 'flagged' where id = v_msg.id and moderation = 'clean';
  return v_id;
end
$$;
revoke all on function public.report_message(uuid, text, text) from public, anon, authenticated;
grant execute on function public.report_message(uuid, text, text) to authenticated;
comment on function public.report_message(uuid, text, text) is 'A member reports another person''s message (snapshot kept, message flagged). Idempotent per reporter and message. Reasons: spam | harassment | inappropriate | scam | contact_sharing | fake_profile | other.';

create function public.submit_report(
  p_target_type public.report_target,
  p_target_id   uuid,
  p_reason_code text,
  p_details     text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_exists  boolean;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'Please sign in to continue.' using errcode = 'ZV401';
  end if;
  if p_target_type is null or p_target_id is null then
    raise exception 'Say what you are reporting.' using errcode = 'ZV400';
  end if;
  if p_target_type = 'message' then
    return public.report_message(p_target_id, p_reason_code, p_details);
  end if;
  if p_reason_code is null or p_reason_code not in ('spam', 'harassment', 'inappropriate', 'scam', 'contact_sharing',
                                                     'fake_profile', 'fake_listing', 'wrong_information', 'other') then
    raise exception 'Choose a reason.' using errcode = 'ZV422';
  end if;
  if v_details is not null and char_length(v_details) > 1000 then
    raise exception 'Details can be up to 1,000 characters.' using errcode = 'ZV422';
  end if;

  v_exists := case p_target_type
    when 'user' then p_target_id <> v_uid and exists (select 1 from public.users u where u.id = p_target_id and u.status <> 'deleted')
    when 'roommate_profile' then p_target_id <> v_uid
                                 and exists (select 1 from public.roommate_profiles r where r.user_id = p_target_id)
                                 and public.roommate_can_view(p_target_id)
    when 'property' then exists (select 1 from public.properties p
                                 where p.id = p_target_id and p.deleted_at is null and p.owner_id <> v_uid)
    when 'review' then exists (select 1 from public.property_reviews r
                               where r.id = p_target_id and r.deleted_at is null and r.author_id <> v_uid)
    else false
  end;
  if not coalesce(v_exists, false) then
    raise exception 'We could not find what you are reporting.' using errcode = 'ZV404';
  end if;

  select r.id into v_id from public.reports r
  where r.reporter_id = v_uid and r.target_type = p_target_type and r.target_id = p_target_id
    and r.status in ('open', 'in_review');
  if v_id is not null then
    return v_id;
  end if;
  if not public.consume_rate_limit('report', greatest(public.setting_int('max_reports_per_day', 20), 1), 86400) then
    raise exception 'You have sent many reports today. Please try again tomorrow.' using errcode = 'ZV429';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason_code, details)
  values (v_uid, p_target_type, p_target_id, p_reason_code, v_details)
  on conflict (reporter_id, target_type, target_id) where status in ('open', 'in_review') and reporter_id is not null do nothing
  returning id into v_id;
  if v_id is null then
    select r.id into v_id from public.reports r
    where r.reporter_id = v_uid and r.target_type = p_target_type and r.target_id = p_target_id
      and r.status in ('open', 'in_review');
  end if;
  return v_id;
end
$$;
revoke all on function public.submit_report(public.report_target, uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_report(public.report_target, uuid, text, text) to authenticated;
comment on function public.submit_report(public.report_target, uuid, text, text) is 'Reports a user, roommate profile, listing or review (messages are delegated to report_message()). One open report per reporter and target; returns the report id. ZV404 when the target does not exist / is not visible / is the caller.';

create function public.submit_appeal(p_moderation_action_id uuid, p_statement text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_statement text := btrim(coalesce(p_statement, ''));
  v_id        uuid;
begin
  if v_uid is null or not exists (select 1 from public.users u where u.id = v_uid and u.status <> 'deleted') then
    raise exception 'Please sign in to continue.' using errcode = 'ZV401';
  end if;
  if not exists (select 1 from public.moderation_actions a
                 where a.id = p_moderation_action_id and a.target_user_id = v_uid
                   and a.action in ('warning', 'restrict', 'suspend', 'content_removed')) then
    raise exception 'Decision not found.' using errcode = 'ZV404';
  end if;
  if char_length(v_statement) not between 10 and 2000 then
    raise exception 'Explain your appeal in 10 to 2,000 characters.' using errcode = 'ZV422';
  end if;
  insert into public.appeals (user_id, moderation_action_id, statement)
  values (v_uid, p_moderation_action_id, v_statement)
  on conflict (moderation_action_id) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'You have already appealed this decision.' using errcode = 'ZV409';
  end if;
  return v_id;
end
$$;
revoke all on function public.submit_appeal(uuid, text) from public, anon, authenticated;
grant execute on function public.submit_appeal(uuid, text) to authenticated;
comment on function public.submit_appeal(uuid, text) is 'The target of a moderation action appeals it once (suspended accounts included). ZV404 not theirs, ZV409 already appealed.';
