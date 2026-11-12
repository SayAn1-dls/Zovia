-- ZUVIO stage 4 / 03 — row level security and grants for roommates, messaging and moderation.
-- Same model as stage 1 / 07: GRANT says which commands and columns, policies say which rows.

-- ───────────────────────────── reference data ─────────────────────────────
grant select on public.lifestyle_questions to anon, authenticated;
create policy lifestyle_questions_select_anon on public.lifestyle_questions for select to anon using (is_active);
create policy lifestyle_questions_select_authenticated on public.lifestyle_questions for select to authenticated using (true);

grant select on public.compatibility_weights to authenticated;
create policy compatibility_weights_select on public.compatibility_weights for select to authenticated using (true);

-- ───────────────────────────── roommate_profiles ─────────────────────────────
grant select, delete on public.roommate_profiles to authenticated;
grant insert (user_id, status, headline, about, age, gender, occupation, occupation_detail, city,
              preferred_localities, budget_min, budget_max, move_in_date, has_place)
  on public.roommate_profiles to authenticated;
grant update (status, headline, about, age, gender, occupation, occupation_detail, city,
              preferred_localities, budget_min, budget_max, move_in_date, has_place)
  on public.roommate_profiles to authenticated;

create policy roommate_profiles_select on public.roommate_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()) or public.roommate_can_view(user_id));

create policy roommate_profiles_insert_own on public.roommate_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

create policy roommate_profiles_update_own on public.roommate_profiles
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()));

create policy roommate_profiles_delete_own on public.roommate_profiles
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ───────────────────────────── roommate_profile_photos ─────────────────────────────
grant select, delete on public.roommate_profile_photos to authenticated;
grant insert (user_id, storage_path, position) on public.roommate_profile_photos to authenticated;
grant update (position) on public.roommate_profile_photos to authenticated;

create policy roommate_profile_photos_select on public.roommate_profile_photos
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()) or public.roommate_can_view(user_id));

create policy roommate_profile_photos_insert_own on public.roommate_profile_photos
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

create policy roommate_profile_photos_update_own on public.roommate_profile_photos
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy roommate_profile_photos_delete_own on public.roommate_profile_photos
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ───────────────────────────── roommate_places ─────────────────────────────
grant select, delete on public.roommate_places to authenticated;
grant insert (user_id, title, description, property_type, locality, city, rent_share, deposit_share,
              vacancies, available_from, furnishing)
  on public.roommate_places to authenticated;
grant update (title, description, property_type, locality, city, rent_share, deposit_share,
              vacancies, available_from, furnishing)
  on public.roommate_places to authenticated;

create policy roommate_places_select on public.roommate_places
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()) or public.roommate_can_view(user_id));

create policy roommate_places_insert_own on public.roommate_places
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

create policy roommate_places_update_own on public.roommate_places
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy roommate_places_delete_own on public.roommate_places
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ───────────────────────────── roommate_preferences / answers / deal-breakers ─────────────────────────────
-- Private to the owner (+ staff). Other people's values reach the engine only through the
-- SECURITY DEFINER card functions, which apply roommate_can_view().
grant select, delete on public.roommate_preferences to authenticated;
grant insert (user_id, preferred_genders, age_min, age_max, occupation_prefs) on public.roommate_preferences to authenticated;
grant update (preferred_genders, age_min, age_max, occupation_prefs) on public.roommate_preferences to authenticated;

create policy roommate_preferences_select on public.roommate_preferences
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy roommate_preferences_insert_own on public.roommate_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy roommate_preferences_update_own on public.roommate_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy roommate_preferences_delete_own on public.roommate_preferences
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, delete on public.roommate_lifestyle_answers to authenticated;
grant insert (user_id, question_code, value) on public.roommate_lifestyle_answers to authenticated;
grant update (value) on public.roommate_lifestyle_answers to authenticated;

create policy roommate_lifestyle_answers_select on public.roommate_lifestyle_answers
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy roommate_lifestyle_answers_insert_own on public.roommate_lifestyle_answers
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy roommate_lifestyle_answers_update_own on public.roommate_lifestyle_answers
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy roommate_lifestyle_answers_delete_own on public.roommate_lifestyle_answers
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, delete on public.roommate_deal_breakers to authenticated;
grant insert (user_id, code) on public.roommate_deal_breakers to authenticated;

create policy roommate_deal_breakers_select on public.roommate_deal_breakers
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy roommate_deal_breakers_insert_own on public.roommate_deal_breakers
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy roommate_deal_breakers_delete_own on public.roommate_deal_breakers
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ───────────────────────────── likes / matches / results ─────────────────────────────
-- Swipes and matches are written only by functions. A user never learns who liked them.
grant select on public.roommate_likes to authenticated;
create policy roommate_likes_select_own on public.roommate_likes
  for select to authenticated
  using (liker_id = (select auth.uid()) or (select public.is_staff()));

grant select on public.roommate_matches to authenticated;
create policy roommate_matches_select_member on public.roommate_matches
  for select to authenticated
  using (user_a = (select auth.uid()) or user_b = (select auth.uid()) or (select public.is_staff()));

grant select, insert, update, delete on public.compatibility_results to authenticated;
create policy compatibility_results_select_own on public.compatibility_results
  for select to authenticated using (viewer_id = (select auth.uid()));
create policy compatibility_results_insert_own on public.compatibility_results
  for insert to authenticated with check (viewer_id = (select auth.uid()));
create policy compatibility_results_update_own on public.compatibility_results
  for update to authenticated using (viewer_id = (select auth.uid())) with check (viewer_id = (select auth.uid()));
create policy compatibility_results_delete_own on public.compatibility_results
  for delete to authenticated using (viewer_id = (select auth.uid()));

-- ───────────────────────────── conversations / members / messages ─────────────────────────────
grant select on public.conversations to authenticated;
create policy conversations_select_member on public.conversations
  for select to authenticated
  using (public.is_conversation_member(id) or (select public.is_staff()));

grant select on public.conversation_members to authenticated;
grant update (muted) on public.conversation_members to authenticated;
create policy conversation_members_select on public.conversation_members
  for select to authenticated
  using (public.is_conversation_member(conversation_id) or (select public.is_staff()));
create policy conversation_members_update_own on public.conversation_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No INSERT / UPDATE / DELETE grant on messages for any API role: send_message() only.
grant select on public.messages to authenticated;
create policy messages_select_member on public.messages
  for select to authenticated
  using (public.is_conversation_member(conversation_id) or (select public.is_staff()));

grant select on public.message_attachments to authenticated;
create policy message_attachments_select_member on public.message_attachments
  for select to authenticated
  using ((select public.is_staff())
         or exists (select 1 from public.messages m
                    where m.id = message_attachments.message_id and public.is_conversation_member(m.conversation_id)));

-- ───────────────────────────── moderation ─────────────────────────────
grant select on public.message_reports to authenticated;
create policy message_reports_select_own_or_staff on public.message_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_staff()));

grant select on public.reports to authenticated;
create policy reports_select_own_or_staff on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_staff()));

grant select on public.moderation_actions to authenticated;
create policy moderation_actions_select_target_or_staff on public.moderation_actions
  for select to authenticated
  using (target_user_id = (select auth.uid()) or (select public.is_staff()));

grant select on public.appeals to authenticated;
create policy appeals_select_own_or_staff on public.appeals
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

-- ───────────────────────────── user_profiles: conversation peers ─────────────────────────────
-- Spec 6.1: profiles are readable by people who share a conversation with the user.
create policy user_profiles_select_conversation_peer on public.user_profiles
  for select to authenticated
  using (public.shares_conversation_with(user_id));
