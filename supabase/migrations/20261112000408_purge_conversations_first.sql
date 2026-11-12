-- ZUVIO stage 4 / 08 — purging an account removes its conversations first.
-- users -> roommate_matches / property_inquiries -> conversations -> messages cascade, while
-- messages.sender_id (and report columns) are ON DELETE SET NULL to the same user. When both
-- happen in one statement Postgres can re-check a message against an already deleted
-- conversation and the purge fails. Deleting the person's conversations in a BEFORE DELETE
-- trigger lets those cascades finish before the user row (and its SET NULL actions) goes.
create function public.users_purge_conversations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.conversations c
  where c.id in (select m.conversation_id from public.conversation_members m where m.user_id = old.id);
  return old;
end
$$;
revoke all on function public.users_purge_conversations() from public, anon, authenticated;

create trigger users_purge_conversations before delete on public.users
  for each row execute function public.users_purge_conversations();
