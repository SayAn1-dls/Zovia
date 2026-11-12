-- Stage 2: review eligibility and ownership, owner replies, verification records, enquiry rules.
begin;
select * from no_plan();

select tests.create_user('o1@test.zuvio', '{"full_name":"Owner One"}'::jsonb);
select tests.create_user('o2@test.zuvio', '{"full_name":"Owner Two"}'::jsonb);
select tests.create_user('enq@test.zuvio', '{"full_name":"Enquirer"}'::jsonb);
select tests.create_user('enq2@test.zuvio', '{"full_name":"Enquirer Two"}'::jsonb);
select tests.create_user('stranger@test.zuvio', '{"full_name":"Stranger"}'::jsonb);
select tests.create_user('susp@test.zuvio', '{"full_name":"Suspended"}'::jsonb);
select tests.create_user('mod@test.zuvio', '{"full_name":"Moderator"}'::jsonb);
select tests.grant_role(tests.user_id('mod@test.zuvio'), 'moderator');
select tests.make_owner(tests.user_id('o1@test.zuvio'));
select tests.make_owner(tests.user_id('o2@test.zuvio'));

create temp table ids as
  select tests.user_id('o1@test.zuvio') as o1, tests.user_id('o2@test.zuvio') as o2, tests.user_id('enq@test.zuvio') as e,
         tests.user_id('enq2@test.zuvio') as e2, tests.user_id('stranger@test.zuvio') as x, tests.user_id('susp@test.zuvio') as su,
         tests.user_id('mod@test.zuvio') as m;
grant select on ids to anon, authenticated, service_role;
create temp table memo (k text primary key, v text);
grant all on memo to anon, authenticated, service_role;
create function pg_temp.m(p_k text) returns uuid language sql stable as 'select v::uuid from memo where k = p_k';
grant execute on function pg_temp.m(text) to anon, authenticated, service_role;

insert into memo select 'pub', tests.create_property((select o1 from ids), 'Reviewed flat', 'entire_unit')::text;
insert into memo select 'draft', tests.create_property((select o1 from ids), 'Draft flat', 'entire_unit')::text;
insert into memo select 'o2pub', tests.create_property((select o2 from ids), 'Other flat', 'entire_unit')::text;
select tests.set_listing_status(pg_temp.m('pub'), 'published');
select tests.set_listing_status(pg_temp.m('o2pub'), 'published');

-- ── enquiries: one open enquiry per seeker per property ──
insert into public.property_inquiries (property_id, seeker_id, message) values (pg_temp.m('pub'), (select e from ids), 'Is it available from January?');
select throws_ok($$ insert into public.property_inquiries (property_id, seeker_id, message) values (pg_temp.m('pub'), (select e from ids), 'Again') $$, '23505', null,
                 'a second open enquiry by the same seeker for the same property is refused');
update public.property_inquiries set status = 'spam' where seeker_id = (select e from ids);
select lives_ok($$ insert into public.property_inquiries (property_id, seeker_id, message, status) values (pg_temp.m('pub'), (select e from ids), 'Old one', 'closed') $$,
                'closed / spam enquiries do not block a new one');
insert into public.property_inquiries (property_id, seeker_id, message) values
  (pg_temp.m('pub'), (select e2 from ids), 'Two people, can we visit on Sunday?'),
  (pg_temp.m('pub'), (select su from ids), 'Enquiry from an account that gets suspended'),
  (pg_temp.m('draft'), (select e from ids), 'Enquiry on a listing that is not public');
with r as (insert into public.rooms (property_id, name) values (pg_temp.m('o2pub'), 'Other room') returning id)
  insert into memo select 'o2room', id::text from r;
select throws_ok($$ insert into public.property_inquiries (property_id, seeker_id, room_id, message) values (pg_temp.m('pub'), (select x from ids), pg_temp.m('o2room'), 'Wrong room') $$,
                 '23503', null, 'an enquiry cannot name a room of another property');
select tests.set_status((select su from ids), 'suspended');

-- ── review eligibility ──
select tests.act_as('stranger@test.zuvio');
select throws_ok($$ insert into public.property_reviews (property_id, author_id, rating, body) values (pg_temp.m('pub'), (select x from ids), 1, 'Never enquired, just angry.') $$,
                 '42501', null, 'someone who never enquired cannot review');
select tests.act_as('o1@test.zuvio');
select throws_ok($$ insert into public.property_reviews (property_id, author_id, rating, body) values (pg_temp.m('pub'), (select o1 from ids), 5, 'My own place is the best.') $$,
                 '42501', null, 'an owner cannot review their own property');
select tests.act_as('susp@test.zuvio');
select throws_ok($$ insert into public.property_reviews (property_id, author_id, rating) values (pg_temp.m('pub'), (select su from ids), 1) $$, '42501', null,
                 'a suspended user cannot review even with an enquiry');
select tests.act_as_anon();
select throws_ok($$ insert into public.property_reviews (property_id, author_id, rating) values (pg_temp.m('pub'), (select e from ids), 1) $$, '42501', null, 'anon cannot review');

select tests.act_as('enq@test.zuvio');
select throws_ok($$ insert into public.property_reviews (property_id, author_id, rating) values (pg_temp.m('pub'), (select e2 from ids), 1) $$, '42501', null,
                 'a review cannot be written in someone else''s name');
select throws_ok($$ insert into public.property_reviews (property_id, author_id, rating) values (pg_temp.m('o2pub'), (select e from ids), 4) $$, '42501', null,
                 'an enquiry with one property does not allow reviewing another');
select throws_ok($$ insert into public.property_reviews (property_id, author_id, rating) values (pg_temp.m('draft'), (select e from ids), 4) $$, '42501', null,
                 'a listing that is not published cannot be reviewed');
select throws_ok($$ insert into public.property_reviews (property_id, author_id, rating, status) values (pg_temp.m('pub'), (select e from ids), 4, 'published') $$, '42501', null,
                 'status is not client-writable on insert');
select lives_ok($$ insert into public.property_reviews (property_id, author_id, rating, title, body) values (pg_temp.m('pub'), (select e from ids), 4, 'Good stay', 'Owner was responsive and the flat matched the photos.') $$,
                'an enquirer reviews the property (their enquiry was marked spam by the owner; that is no veto)');
select throws_ok($$ insert into public.property_reviews (property_id, author_id, rating) values (pg_temp.m('pub'), (select e from ids), 1) $$, '23505', null,
                 'one review per author per property');
insert into memo select 'rv', id::text from public.property_reviews where author_id = (select e from ids);
select tests.act_as('enq2@test.zuvio');
select lives_ok($$ insert into public.property_reviews (property_id, author_id, rating) values (pg_temp.m('pub'), (select e2 from ids), 2) $$, 'a second enquirer reviews too');
insert into memo select 'rv2', id::text from public.property_reviews where author_id = (select e2 from ids);
select tests.act_as_owner();
select is((select rating_avg::text || ' / ' || rating_count from public.properties where id = pg_temp.m('pub')), '3.00 / 2', 'aggregates follow reviews written by API users');

-- ── author edits own review only; protected columns ──
select tests.act_as('enq@test.zuvio');
select lives_ok($$ update public.property_reviews set rating = 5, body = 'Even better after a month of living here.' where id = pg_temp.m('rv') $$, 'the author edits their review');
select throws_ok($$ update public.property_reviews set status = 'published' where id = pg_temp.m('rv') $$, '42501', null, 'the author cannot write status');
select throws_ok($$ update public.property_reviews set property_id = pg_temp.m('o2pub') where id = pg_temp.m('rv') $$, '42501', null, 'the author cannot move a review to another property');
select throws_ok($$ update public.property_reviews set author_id = (select e2 from ids) where id = pg_temp.m('rv') $$, '42501', null, 'the author cannot re-assign a review');
update public.property_reviews set rating = 1 where id = pg_temp.m('rv2');
delete from public.property_reviews where id = pg_temp.m('rv2');
select tests.act_as('o1@test.zuvio');
update public.property_reviews set rating = 5 where id = pg_temp.m('rv2');
delete from public.property_reviews where id = pg_temp.m('rv2');
select tests.act_as_owner();
select is((select rating from public.property_reviews where id = pg_temp.m('rv2')), 2::smallint, 'neither another user nor the property owner can edit or delete someone''s review');
select is((select rating_avg::text || ' / ' || rating_count from public.properties where id = pg_temp.m('pub')), '3.50 / 2', 'aggregates follow the author''s edit');

-- ── owner replies ──
select tests.act_as('o2@test.zuvio');
select throws_ok($$ insert into public.owner_replies (review_id, owner_id, body) values (pg_temp.m('rv'), (select o2 from ids), 'Not my property but I reply anyway') $$, '42501', null,
                 'an owner cannot reply to a review of someone else''s property');
select tests.act_as('enq@test.zuvio');
select throws_ok($$ insert into public.owner_replies (review_id, owner_id, body) values (pg_temp.m('rv'), (select e from ids), 'Replying to myself') $$, '42501', null,
                 'a non-owner cannot reply');
select tests.act_as('o1@test.zuvio');
select throws_ok($$ insert into public.owner_replies (review_id, owner_id, body) values (pg_temp.m('rv'), (select o2 from ids), 'In another owner''s name') $$, '42501', null,
                 'a reply cannot be written in another owner''s name');
select lives_ok($$ insert into public.owner_replies (review_id, owner_id, body) values (pg_temp.m('rv'), (select o1 from ids), 'Thank you, glad you liked it.') $$,
                'the owner replies to a review of their own property');
select throws_ok($$ insert into public.owner_replies (review_id, owner_id, body) values (pg_temp.m('rv'), (select o1 from ids), 'A second reply') $$, '23505', null,
                 'only one reply per review');
select lives_ok($$ update public.owner_replies set body = 'Thank you! You are welcome back any time.' where review_id = pg_temp.m('rv') $$, 'the owner edits their reply');
select tests.act_as('o2@test.zuvio');
update public.owner_replies set body = 'Defaced' where review_id = pg_temp.m('rv');
delete from public.owner_replies where review_id = pg_temp.m('rv');
select tests.act_as_anon();
select is((select body from public.owner_replies where review_id = pg_temp.m('rv')), 'Thank you! You are welcome back any time.', 'anon reads the reply; another owner could not change or delete it');
select is((select count(*)::int from public.property_reviews), 2, 'anon reads published reviews of published listings');

-- ── hidden / removed reviews ──
select tests.act_as_owner();
update public.property_reviews set status = 'hidden' where id = pg_temp.m('rv');
select tests.act_as_anon();
select is((select count(*)::int from public.property_reviews), 1, 'anon no longer sees the hidden review');
select is((select count(*)::int from public.owner_replies), 0, 'nor the reply to it');
select tests.act_as('stranger@test.zuvio');
select is((select count(*)::int from public.property_reviews), 1, 'other users do not see the hidden review');
select tests.act_as('enq@test.zuvio');
select is((select status::text from public.property_reviews where id = pg_temp.m('rv')), 'hidden', 'the author still sees their own hidden review');
update public.property_reviews set rating = 1 where id = pg_temp.m('rv');
select tests.act_as('o1@test.zuvio');
select is((select count(*)::int from public.property_reviews), 1, 'the property owner does not see the hidden review');
select is((select count(*)::int from public.owner_replies), 1, 'but still sees their own reply');
select tests.act_as('mod@test.zuvio');
select is((select count(*)::int from public.property_reviews), 2, 'staff see every review');
select throws_ok($$ update public.property_reviews set status = 'removed' where id = pg_temp.m('rv') $$, '42501', null, 'staff change review status only through the admin function');
select tests.act_as_owner();
select is((select rating from public.property_reviews where id = pg_temp.m('rv')), 5::smallint, 'a hidden review cannot be edited by its author');
update public.property_reviews set status = 'published' where id = pg_temp.m('rv');
-- reviews disappear from the public with the listing
select tests.set_listing_status(pg_temp.m('pub'), 'paused');
select tests.act_as_anon();
select is((select count(*)::int from public.property_reviews), 0, 'reviews of a paused listing are not public');
select tests.act_as_owner();
select tests.set_listing_status(pg_temp.m('pub'), 'published');
-- the author deletes their review; the reply goes with it
select tests.act_as('enq@test.zuvio');
delete from public.property_reviews where id = pg_temp.m('rv');
select tests.act_as_owner();
select is((select count(*)::int from public.property_reviews where id = pg_temp.m('rv')), 0, 'the author deletes their own review');
select is((select count(*)::int from public.owner_replies), 0, 'its reply is deleted with it');
select is((select rating_avg::text || ' / ' || rating_count from public.properties where id = pg_temp.m('pub')), '2.00 / 1', 'aggregates follow the deletion');

-- ── verification records ──
select tests.act_as('o1@test.zuvio');
select lives_ok($$ insert into public.verification_records (subject_type, subject_id, submitted_by, kind, document_path)
                   values ('owner', (select o1 from ids), (select o1 from ids), 'government_id', (select o1 from ids)::text || '/id.pdf') $$, 'an owner submits an identity document');
select lives_ok($$ insert into public.verification_records (subject_type, subject_id, submitted_by, kind, document_path)
                   values ('property', pg_temp.m('pub'), (select o1 from ids), 'ownership_proof', (select o1 from ids)::text || '/deed.pdf') $$, 'an owner submits a property document');
select is((select count(*)::int from public.verification_records where status = 'pending'), 2, 'records start as pending and the submitter reads them');
select throws_ok($$ insert into public.verification_records (subject_type, subject_id, submitted_by, kind, document_path)
                    values ('owner', (select o1 from ids), (select o1 from ids), 'government_id', (select o1 from ids)::text || '/id2.pdf') $$, '23505', null,
                 'one pending record per subject and kind');
select throws_ok($$ insert into public.verification_records (subject_type, subject_id, submitted_by, kind, document_path, status)
                    values ('owner', (select o1 from ids), (select o1 from ids), 'business_registration', (select o1 from ids)::text || '/reg.pdf', 'verified') $$, '42501', null,
                 'status is not client-writable');
select throws_ok($$ insert into public.verification_records (subject_type, subject_id, submitted_by, kind, document_path)
                    values ('owner', (select o1 from ids), (select o1 from ids), 'business_registration', (select o2 from ids)::text || '/reg.pdf') $$, '23514', null,
                 'the document must be in the submitter''s own folder');
select throws_ok($$ insert into public.verification_records (subject_type, subject_id, submitted_by, kind, document_path)
                    values ('property', pg_temp.m('o2pub'), (select o1 from ids), 'ownership_proof', (select o1 from ids)::text || '/theirs.pdf') $$, 'ZV404', null,
                 'documents cannot be submitted for someone else''s property');
select throws_ok($$ insert into public.verification_records (subject_type, subject_id, submitted_by, kind, document_path)
                    values ('owner', (select o2 from ids), (select o2 from ids), 'government_id', (select o2 from ids)::text || '/id.pdf') $$, '42501', null,
                 'documents cannot be submitted in another user''s name');
select throws_ok($$ update public.verification_records set status = 'verified', reviewed_at = now() $$, '42501', null, 'the submitter cannot approve their own record');
select throws_ok($$ delete from public.verification_records $$, '42501', null, 'records cannot be deleted by clients');
select tests.act_as('enq@test.zuvio');
select throws_ok($$ insert into public.verification_records (subject_type, subject_id, submitted_by, kind, document_path)
                    values ('owner', (select e from ids), (select e from ids), 'government_id', (select e from ids)::text || '/id.pdf') $$, 'ZV422', null,
                 'only registered owners submit owner documents');
select is((select count(*)::int from public.verification_records), 0, 'other users read no verification records');
select tests.act_as('o2@test.zuvio');
select is((select count(*)::int from public.verification_records), 0, 'another owner reads no verification records');
select tests.act_as('mod@test.zuvio');
select is((select count(*)::int from public.verification_records), 2, 'staff read all verification records');
select throws_ok($$ update public.verification_records set status = 'verified', reviewed_at = now() $$, '42501', null, 'staff decide only through the admin function');
select tests.act_as_owner();
select throws_ok($$ update public.verification_records set status = 'verified' where kind = 'government_id' $$, '23514', null, 'a decided record needs reviewed_at');
-- records about a property go with the property
select tests.set_listing_status(pg_temp.m('pub'), 'draft');
delete from public.properties where id = pg_temp.m('pub');
select is((select count(*)::int from public.verification_records where subject_type = 'property'), 0, 'deleting a property removes its verification records');
select is((select count(*)::int from public.verification_records where subject_type = 'owner'), 1, 'the owner''s own record stays');

select * from finish();
rollback;
