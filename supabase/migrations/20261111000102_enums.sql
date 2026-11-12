-- ZUVIO stage 1 / 02 — shared enum types. Later stages add their own domain enums.
-- Adding a value later: `alter type public.<name> add value '<value>';` in its own migration
-- (a new enum value cannot be used in the transaction that adds it).

create type public.user_role as enum ('seeker', 'owner', 'moderator', 'admin');
comment on type public.user_role is 'Roles stored in user_roles. seeker is the default; owner is self-serve; moderator and admin are staff.';

create type public.account_status as enum ('active', 'restricted', 'suspended', 'deleted');
comment on type public.account_status is 'users.status. restricted = has scoped restrictions but may use the product; suspended = may only see the suspended screen and appeal; deleted = anonymised, awaiting purge.';

create type public.user_intent as enum ('find_home', 'find_roommate', 'have_place_need_roommate', 'list_property');

create type public.occupation_type as enum ('student', 'working_professional', 'other');

create type public.gender as enum ('male', 'female', 'non_binary', 'prefer_not_to_say');

create type public.work_schedule as enum ('day', 'night', 'flexible', 'remote', 'irregular');

create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected', 'expired');

create type public.restriction_kind as enum ('messaging', 'matching', 'listing', 'all');
comment on type public.restriction_kind is 'Scope of a user_restrictions row. "all" covers every other kind.';

create type public.violation_kind as enum ('contact_sharing', 'harassment', 'spam', 'other');

create type public.notification_type as enum (
  'system',
  'new_message',
  'roommate_match',
  'inquiry_received',
  'inquiry_responded',
  'listing_submitted',
  'listing_approved',
  'listing_rejected',
  'listing_stale',
  'verification_approved',
  'verification_rejected',
  'review_received',
  'review_reply',
  'contact_warning',
  'moderation_warning',
  'restriction_applied',
  'restriction_lifted',
  'account_suspended',
  'account_reinstated',
  'report_resolved',
  'appeal_decided'
);
comment on type public.notification_type is 'notifications.type. The client picks icon and copy from this; link_path says where a click goes.';
