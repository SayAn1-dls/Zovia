-- ───────────────────────────── public_user_cards: need-to-know only ─────────────────────────────
-- The view used to return the card (user_id, display_name, avatar_path) of EVERY non-deleted user
-- to anyone, signed in or not. With the anon key that ships to every browser, one request to the
-- Data API listed the whole user base. A card is now visible only when the caller has a reason to
-- see that person, which is exactly what the app reads it for:
--   * everyone:      authors of published reviews on published listings (property pages)
--   * signed in:     themselves; the other people in their conversations (chat headers); their
--                    roommate matches; the two sides of their bookings and enquiries; authors of
--                    reviews on their own listings (owner dashboard)
--   * staff:         everyone (moderation)
-- Still not security_invoker: it reads past the RLS of the tables it consults, so every condition
-- is written out here against auth.uid(). Deleted accounts never have a card.
create or replace view public.public_user_cards
with (security_barrier = true, security_invoker = false)
as
  select p.user_id, p.display_name, p.avatar_path
  from public.user_profiles p
  join public.users u on u.id = p.user_id
  where u.status <> 'deleted' and u.deleted_at is null
    and (
      p.user_id = (select auth.uid())
      or (select public.is_staff())
      -- reviewer on a public listing
      or exists (select 1 from public.property_reviews r
                 join public.properties pr on pr.id = r.property_id
                 where r.author_id = p.user_id and r.status = 'published' and r.deleted_at is null
                   and pr.status = 'published' and pr.deleted_at is null)
      -- reviewer on one of the caller's listings, any review status
      or exists (select 1 from public.property_reviews r
                 join public.properties pr on pr.id = r.property_id
                 where r.author_id = p.user_id and pr.owner_id = (select auth.uid()))
      -- shares a conversation with the caller
      or exists (select 1 from public.conversation_members theirs
                 join public.conversation_members mine on mine.conversation_id = theirs.conversation_id
                 where theirs.user_id = p.user_id and mine.user_id = (select auth.uid()))
      -- roommate match with the caller
      or exists (select 1 from public.roommate_matches m
                 where (m.user_a = p.user_id and m.user_b = (select auth.uid()))
                    or (m.user_b = p.user_id and m.user_a = (select auth.uid())))
      -- the other side of an enquiry
      or exists (select 1 from public.property_inquiries i
                 join public.properties pr on pr.id = i.property_id
                 where (i.seeker_id = p.user_id and pr.owner_id = (select auth.uid()))
                    or (pr.owner_id = p.user_id and i.seeker_id = (select auth.uid())))
      -- the other side of a booking
      or exists (select 1 from public.bookings b
                 where (b.seeker_id = p.user_id and b.owner_id = (select auth.uid()))
                    or (b.owner_id = p.user_id and b.seeker_id = (select auth.uid())))
    );

comment on view public.public_user_cards is 'Card (user_id, display_name, avatar_path) of a non-deleted user, visible only to callers with a reason to see it: published reviewers to everyone; self, conversation partners, roommate matches, enquiry and booking counterparts and reviewers of own listings to signed-in users; everyone to staff. Never add columns or widen the conditions without a privacy review.';

revoke all on public.public_user_cards from anon, authenticated;
grant select on public.public_user_cards to anon, authenticated, service_role;
