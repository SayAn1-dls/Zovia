-- Stage 2: the listing lifecycle trigger. Owners (and every API role) can never publish a listing
-- that was not approved; staff transitions work only from trusted code with the staff flag.
begin;
select * from no_plan();

select tests.create_user('o1@test.zuvio', '{"full_name":"Owner One"}'::jsonb);
select tests.make_owner(tests.user_id('o1@test.zuvio'));
create temp table memo (k text primary key, v text);
grant all on memo to anon, authenticated, service_role;
create function pg_temp.m(p_k text) returns uuid language sql stable as 'select v::uuid from memo where k = p_k';
grant execute on function pg_temp.m(text) to anon, authenticated, service_role;
create function pg_temp.st(p_k text) returns text language sql stable as 'select status::text from public.properties where id = (select v::uuid from memo where k = p_k)';

insert into memo select 'bed', tests.create_property(tests.user_id('o1@test.zuvio'), 'Per bed listing')::text;
insert into memo select 'unit', tests.create_property(tests.user_id('o1@test.zuvio'), 'Whole flat', 'entire_unit')::text;

-- ── new listings are drafts; nothing but a draft can be inserted ──
select is(pg_temp.st('bed'), 'draft', 'a new listing is a draft');
select throws_ok($$ insert into public.properties (owner_id, title, property_type, listing_mode, status) values (tests.user_id('o1@test.zuvio'), 'Born published', 'pg', 'per_bed', 'published') $$,
                 'ZV403', null, 'even trusted code cannot insert a non-draft listing without the system flag');
select tests.act_as_service();
select throws_ok($$ insert into public.properties (owner_id, title, property_type, listing_mode, status) values (tests.user_id('o1@test.zuvio'), 'Born published', 'pg', 'per_bed', 'published') $$,
                 'ZV403', null, 'service_role cannot insert a published listing');
select set_config('zuvio.listing_actor', 'system', true);
select throws_ok($$ insert into public.properties (owner_id, title, property_type, listing_mode, status) values (tests.user_id('o1@test.zuvio'), 'Born published', 'pg', 'per_bed', 'published') $$,
                 'ZV403', null, 'the system flag is ignored for service_role');
select set_config('zuvio.listing_actor', '', true);

-- ── API roles: every route to "published" for an unapproved listing is closed ──
select tests.act_as('o1@test.zuvio');
select throws_ok($$ update public.properties set status = 'published' where id = pg_temp.m('bed') $$, '42501', null, 'owner: no UPDATE grant on status');
select throws_ok($$ update public.properties set approved_at = now() where id = pg_temp.m('bed') $$, '42501', null, 'owner: no UPDATE grant on approved_at');
select set_config('zuvio.listing_actor', 'staff', true);
select throws_ok($$ update public.properties set status = 'published' where id = pg_temp.m('bed') $$, '42501', null, 'owner: setting the flag changes nothing');
select set_config('zuvio.listing_actor', '', true);

select tests.act_as_service();
select throws_ok($$ update public.properties set status = 'published' where id = pg_temp.m('bed') $$, 'ZV403', null, 'service_role: draft -> published refused by the trigger');
select set_config('zuvio.listing_actor', 'staff', true);
select throws_ok($$ update public.properties set status = 'published' where id = pg_temp.m('bed') $$, 'ZV403', null, 'service_role with the staff flag: still refused (flag honoured only for the table owner)');
select set_config('zuvio.listing_actor', 'system', true);
select throws_ok($$ update public.properties set status = 'published' where id = pg_temp.m('bed') $$, 'ZV403', null, 'service_role with the system flag: still refused');
select set_config('zuvio.listing_actor', '', true);
select throws_ok($$ update public.properties set status = 'paused' where id = pg_temp.m('bed') $$, 'ZV403', null, 'draft -> paused refused');
select throws_ok($$ update public.properties set status = 'rejected', rejection_reason = 'x' where id = pg_temp.m('bed') $$, 'ZV403', null, 'draft -> rejected refused');

-- ── leaving draft needs the structural minimum ──
select throws_ok($$ update public.properties set status = 'pending_review' where id = pg_temp.m('bed') $$, 'ZV422', 'Add at least one room with a bed before submitting this listing.',
                 'a per_bed listing without a bed cannot be submitted');
select tests.act_as_owner();
update public.properties set location = null where id = pg_temp.m('unit');
select throws_ok($$ update public.properties set status = 'pending_review' where id = pg_temp.m('unit') $$, 'ZV422', 'Pin the property on the map before submitting it.',
                 'a listing without a map pin cannot be submitted');
update public.properties set location = extensions.st_setsrid(extensions.st_makepoint(77.6245, 12.9352), 4326)::extensions.geography, monthly_rent = null where id = pg_temp.m('unit');
select throws_ok($$ update public.properties set status = 'pending_review' where id = pg_temp.m('unit') $$, 'ZV422', 'Add the monthly rent before submitting this listing.',
                 'an entire_unit listing without rent cannot be submitted');
update public.properties set monthly_rent = 25000 where id = pg_temp.m('unit');
-- the CHECK constraints back the trigger up even when the trigger is bypassed
set local zuvio.listing_actor = 'system';
select throws_ok($$ update public.properties set status = 'published', location = null where id = pg_temp.m('unit') $$, '23514', null, 'CHECK: no listing outside draft without a location, even for system');
select throws_ok($$ update public.properties set status = 'published', monthly_rent = null where id = pg_temp.m('unit') $$, '23514', null, 'CHECK: no entire_unit listing outside draft without rent, even for system');
set local zuvio.listing_actor = '';

with r as (insert into public.rooms (property_id, name, capacity, rent_per_bed) values (pg_temp.m('bed'), 'R1', 2, 9000) returning id)
insert into public.beds (room_id, label) select id, 'A' from r;

-- ── owner class: draft -> pending_review (stamps), then nothing further ──
select tests.act_as_service();
select lives_ok($$ update public.properties set status = 'pending_review', submitted_at = '2000-01-01', approved_at = now(), published_at = now() where id = pg_temp.m('bed') $$,
                'owner class: draft -> pending_review');
select tests.act_as_owner();
select is(pg_temp.st('bed'), 'pending_review', 'status is pending_review');
select ok((select submitted_at > now() - interval '1 minute' and last_confirmed_at is not null from public.properties where id = pg_temp.m('bed')), 'submitted_at and last_confirmed_at are stamped by the trigger');
select ok((select approved_at is null and published_at is null from public.properties where id = pg_temp.m('bed')), 'forged approved_at / published_at are discarded');
select tests.act_as_service();
select throws_ok($$ update public.properties set status = 'published' where id = pg_temp.m('bed') $$, 'ZV403', 'This listing cannot be moved from "pending review" to "published".',
                 'owner class cannot approve its own listing');
select throws_ok($$ update public.properties set status = 'rejected', rejection_reason = 'x' where id = pg_temp.m('bed') $$, 'ZV403', null, 'owner class cannot reject');
select throws_ok($$ update public.properties set status = 'draft' where id = pg_temp.m('bed') $$, 'ZV403', null, 'pending_review -> draft is not a transition');
select lives_ok($$ update public.properties set approved_at = now() where id = pg_temp.m('bed') $$, 'writing approved_at as an API role is silently ignored');
select tests.act_as_owner();
select is((select approved_at from public.properties where id = pg_temp.m('bed')), null, 'approved_at is still empty');
-- trusted code WITHOUT the staff flag is owner class too
select throws_ok($$ update public.properties set status = 'published' where id = pg_temp.m('bed') $$, 'ZV403', null, 'trusted code without the staff flag cannot approve');

-- ── staff (trusted code + flag): reject needs a reason; rejected -> pending_review -> published ──
set local zuvio.listing_actor = 'staff';
select throws_ok($$ update public.properties set status = 'rejected' where id = pg_temp.m('bed') $$, 'ZV422', 'Give the owner a reason for the rejection.', 'rejecting needs a reason');
select throws_ok($$ update public.properties set status = 'rejected', rejection_reason = '   ' where id = pg_temp.m('bed') $$, 'ZV422', null, 'a blank reason is not a reason');
select lives_ok($$ update public.properties set status = 'rejected', rejection_reason = ' Photos are missing ' where id = pg_temp.m('bed') $$, 'staff: pending_review -> rejected');
select is((select rejection_reason from public.properties where id = pg_temp.m('bed')), 'Photos are missing', 'the reason is stored trimmed');
select throws_ok($$ update public.properties set status = 'published' where id = pg_temp.m('bed') $$, 'ZV403', null, 'staff: rejected -> published is not a transition');
set local zuvio.listing_actor = '';
select tests.act_as_service();
select throws_ok($$ update public.properties set status = 'published' where id = pg_temp.m('bed') $$, 'ZV403', null, 'owner class: rejected -> published refused');
select lives_ok($$ update public.properties set rejection_reason = 'rewritten by owner' where id = pg_temp.m('bed') $$, 'an API role writing rejection_reason is ignored');
select lives_ok($$ update public.properties set status = 'pending_review' where id = pg_temp.m('bed') $$, 'owner class: rejected -> pending_review (resubmission)');
select tests.act_as_owner();
select is((select rejection_reason from public.properties where id = pg_temp.m('bed')), null, 'resubmission clears the reason');
set local zuvio.listing_actor = 'staff';
select lives_ok($$ update public.properties set status = 'published' where id = pg_temp.m('bed') $$, 'staff: pending_review -> published');
set local zuvio.listing_actor = '';
select ok((select approved_at is not null and published_at is not null from public.properties where id = pg_temp.m('bed')), 'approval stamps approved_at and published_at');
insert into memo select 'published_at', published_at::text from public.properties where id = pg_temp.m('bed');

-- ── owner class: published <-> paused ──
select tests.act_as_service();
select throws_ok($$ update public.properties set status = 'draft' where id = pg_temp.m('bed') $$, 'ZV403', null, 'published -> draft refused');
select throws_ok($$ update public.properties set status = 'pending_review' where id = pg_temp.m('bed') $$, 'ZV403', null, 'published -> pending_review refused');
select throws_ok($$ update public.properties set owner_id = gen_random_uuid() where id = pg_temp.m('bed') $$, 'ZV403', 'A listing cannot be moved to another owner.', 'owner_id is immutable');
select lives_ok($$ update public.properties set status = 'paused' where id = pg_temp.m('bed') $$, 'owner class: published -> paused');
select lives_ok($$ update public.properties set status = 'published' where id = pg_temp.m('bed') $$, 'owner class: paused -> published (it was approved before)');
select tests.act_as_owner();
select is((select published_at::text from public.properties where id = pg_temp.m('bed')), (select v from memo where k = 'published_at'), 'resuming keeps the original published_at');

-- a paused listing that was never approved (only possible through the system bypass) cannot resume
select tests.set_listing_status(pg_temp.m('unit'), 'paused');
set local zuvio.listing_actor = 'system';
update public.properties set approved_at = null where id = pg_temp.m('unit');
set local zuvio.listing_actor = '';
select tests.act_as_service();
select throws_ok($$ update public.properties set status = 'published' where id = pg_temp.m('unit') $$, 'ZV403', null, 'paused -> published refused when the listing was never approved');
select throws_ok($$ update public.properties set status = 'published', approved_at = now() where id = pg_temp.m('unit') $$, 'ZV403', null, 'and approved_at cannot be forged in the same update');

-- ── staff: published -> rejected; any -> archived; archived is final ──
select tests.act_as_owner();
set local zuvio.listing_actor = 'staff';
select lives_ok($$ update public.properties set status = 'rejected', rejection_reason = 'Reported as fake' where id = pg_temp.m('bed') $$, 'staff: published -> rejected');
set local zuvio.listing_actor = '';
select tests.act_as_service();
select lives_ok($$ update public.properties set status = 'archived' where id = pg_temp.m('bed') $$, 'owner class: rejected -> archived');
select lives_ok($$ update public.properties set status = 'archived' where id = pg_temp.m('unit') $$, 'owner class: paused -> archived');
select throws_ok($$ update public.properties set status = 'draft' where id = pg_temp.m('bed') $$, 'ZV403', null, 'archived -> draft refused');
select throws_ok($$ update public.properties set status = 'pending_review' where id = pg_temp.m('bed') $$, 'ZV403', null, 'archived -> pending_review refused');
select tests.act_as_owner();
set local zuvio.listing_actor = 'staff';
select throws_ok($$ update public.properties set status = 'published' where id = pg_temp.m('bed') $$, 'ZV403', null, 'staff cannot revive an archived listing');
set local zuvio.listing_actor = '';

-- ── a SECURITY DEFINER function is the intended route: it works for an API caller ──
insert into memo select 'viafn', tests.create_property(tests.user_id('o1@test.zuvio'), 'Via function', 'entire_unit')::text;
create function public.zz_test_approve(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('zuvio.listing_actor', 'owner', true);
  update public.properties set status = 'pending_review' where id = p_id;
  perform set_config('zuvio.listing_actor', 'staff', true);
  update public.properties set status = 'published' where id = p_id;
  perform set_config('zuvio.listing_actor', '', true);
end $$;
grant execute on function public.zz_test_approve(uuid) to authenticated;
select tests.act_as('o1@test.zuvio');
select lives_ok($$ select public.zz_test_approve(pg_temp.m('viafn')) $$, 'a definer function sets the flag and performs the staff transition');
select is((select status::text from public.properties where id = pg_temp.m('viafn')), 'published', 'the listing is published');
select throws_ok($$ update public.properties set status = 'paused' where id = pg_temp.m('viafn') $$, '42501', null, 'afterwards the caller is an ordinary API role again');

select * from finish();
rollback;
