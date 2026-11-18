-- Stay bookings (docs/stay-booking.md): price vectors, nightly capacity, privacy, cancellation
-- refunds, holds, payments.
begin;
select * from no_plan();
-- The hoarding limits (00530) are tested on their own; here they would get in the way of the
-- many bookings one test user makes. Rolled back with the rest of the file.
alter table public.stay_bookings disable trigger stay_bookings_abuse_caps;

select tests.create_user('sa@test.zuvio', '{"full_name":"Stay A"}'::jsonb);
select tests.create_user('sb@test.zuvio', '{"full_name":"Stay B"}'::jsonb);
select tests.create_user('sstaff@test.zuvio', '{"full_name":"Stay Staff"}'::jsonb);
select tests.create_user('ssus@test.zuvio', '{"full_name":"Stay Suspended"}'::jsonb);
select tests.grant_role(tests.user_id('sstaff@test.zuvio'), 'admin');
select tests.set_status(tests.user_id('ssus@test.zuvio'), 'suspended');

create temp table memo (k text primary key, v text);
grant all on memo to anon, authenticated, service_role;
create function pg_temp.m(p_k text) returns uuid language sql stable as 'select v::uuid from memo where k = p_k';
grant execute on function pg_temp.m(text) to anon, authenticated, service_role;
-- d(n): India date n days from today.
create function pg_temp.d(p_n integer) returns date language sql stable as 'select public.stay_today() + p_n';
grant execute on function pg_temp.d(integer) to anon, authenticated, service_role;
create function pg_temp.book(p_listing text, p_in integer, p_out integer, p_rooms jsonb, p_mode text default 'at_property')
returns jsonb language sql volatile as
  $f$ select public.book_stay(p_listing, pg_temp.d(p_in), pg_temp.d(p_out), p_rooms, 'Asha Rao', '9876543210',
                              'Asha@Example.com', null, p_mode) $f$;
grant execute on function pg_temp.book(text, integer, integer, jsonb, text) to anon, authenticated, service_role;

-- fixtures: inventory as the sync script writes it
insert into public.stay_inventory (listing_ref, room_type, units, rent_per_month, ac, attached_bathroom) values
  ('t-vec', 'single', 4, 6500, false, false),
  ('t-vec', 'double', 4, 9000, true, false),
  ('t-vec', 'triple', 4, 12000, false, true),
  ('t-lux', 'single', 2, 250000, true, true),
  ('t-cap', 'double', 2, 9000, false, false),
  ('t-off', 'single', 5, 9000, false, false);
update public.stay_inventory set active = false where listing_ref = 't-off';

-- ───────── schema and grants ─────────
select ok((select relrowsecurity from pg_class where oid = 'public.stay_inventory'::regclass), 'stay_inventory has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.stay_bookings'::regclass), 'stay_bookings has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.stay_booking_items'::regclass), 'stay_booking_items has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.stay_settings'::regclass), 'stay_settings has RLS');
select ok(not has_table_privilege('authenticated', 'public.stay_bookings', 'insert,update,delete'), 'no client writes on bookings');
select ok(not has_table_privilege('anon', 'public.stay_bookings', 'select'), 'anon cannot read bookings');
select ok(not has_function_privilege('anon', 'public.book_stay(text,date,date,jsonb,text,text,text,text,text)', 'execute'), 'anon cannot book');
select ok(has_function_privilege('anon', 'public.stay_availability(text,date,date)', 'execute'), 'anon can check availability');
select ok(not has_function_privilege('authenticated', 'public.mark_stay_paid(text,text,bigint)', 'execute'), 'users cannot mark a stay paid');
select ok(not has_function_privilege('authenticated', 'public.record_stay_order(uuid,text,bigint)', 'execute'), 'users cannot record orders');
select ok(not has_function_privilege('authenticated', 'public.expire_stay_holds()', 'execute'), 'users cannot run the expiry job');
select ok(has_function_privilege('service_role', 'public.expire_stay_holds()', 'execute'), 'the server can run the expiry job');

-- ───────── pure helpers ─────────
select is(public.stay_unit_price(9000), 300, 'unit price 9,000/month = 300/night');
select is(public.stay_unit_price(6500), 217, 'unit price 6,500/month = 217/night (216.67 rounds up)');
select is(public.stay_unit_price(250000), 8334, 'unit price 250,000/month = 8,334/night');
select is(public.stay_tax(217, 5), 11, 'tax 10.85 rounds half up to 11');
select is(public.stay_tax(16668, 18), 3000, 'tax 3,000.24 rounds to 3,000');
select is(public.stay_tax_percent(7500), 5, '5% at exactly 7,500 a night');
select is(public.stay_tax_percent(7501), 18, '18% above 7,500 a night');
select is(public.stay_free_cancel_deadline(date '2026-12-10'), timestamptz '2026-12-03 13:00:00+05:30', 'free cancellation ends D-7 13:00 India time');

-- ───────── availability (anon) ─────────
select tests.act_as_anon();
select is(jsonb_array_length(public.stay_availability('t-vec', pg_temp.d(3), pg_temp.d(5))), 3, 'three room types');
select is(public.stay_availability('t-vec', pg_temp.d(3), pg_temp.d(5)) -> 0 ->> 'room_type', 'single', 'ordered single, double, triple');
select is(jsonb_array_length(public.stay_availability('t-vec', pg_temp.d(3), pg_temp.d(5)) -> 0 -> 'strip'), 7, '7-night strip');
select is(public.stay_availability('nope', pg_temp.d(3), pg_temp.d(5)), '[]'::jsonb, 'unknown listing: empty');
select is(public.stay_availability('t-off', pg_temp.d(3), pg_temp.d(5)), '[]'::jsonb, 'inactive inventory is hidden');
select throws_ok($$ select public.stay_availability('t-vec', pg_temp.d(-1), pg_temp.d(2)) $$, 'ZV422', null, 'no past check-in');
select throws_ok($$ select public.stay_availability('t-vec', pg_temp.d(3), pg_temp.d(3)) $$, 'ZV422', null, 'check-out after check-in');
select throws_ok($$ select public.stay_availability('t-vec', pg_temp.d(3), pg_temp.d(34)) $$, 'ZV422', null, 'at most 30 nights');

-- ───────── price vectors (SQL recomputes; the client sends no prices) ─────────
select tests.act_as('sa@test.zuvio');
insert into memo select 'v1', (pg_temp.book('t-vec', 40, 43, '[{"room_type":"double","qty":2}]')) ->> 'id';
select is((select amount_stay_inr || '/' || amount_tax_inr || '/' || amount_total_inr from public.stay_bookings where id = pg_temp.m('v1')),
          '1800/90/1890', 'vector 1: 9,000 x2 units x3 nights = 1,800 + 90 = 1,890');
insert into memo select 'v2', (pg_temp.book('t-vec', 40, 41, '[{"room_type":"single","qty":1}]')) ->> 'id';
select is((select amount_stay_inr || '/' || amount_tax_inr || '/' || amount_total_inr from public.stay_bookings where id = pg_temp.m('v2')),
          '217/11/228', 'vector 2: 6,500 x1 x1 = 217 + 11 = 228');
insert into memo select 'v3', (pg_temp.book('t-vec', 40, 42, '[{"room_type":"triple","qty":3}]')) ->> 'id';
select is((select amount_stay_inr || '/' || amount_tax_inr || '/' || amount_total_inr from public.stay_bookings where id = pg_temp.m('v3')),
          '2400/120/2520', 'vector 3: 12,000 x3 x2 = 2,400 + 120 = 2,520');
insert into memo select 'v4', (pg_temp.book('t-lux', 40, 42, '[{"room_type":"single","qty":1}]')) ->> 'id';
select is((select amount_stay_inr || '/' || tax_percent || '/' || amount_tax_inr || '/' || amount_total_inr from public.stay_bookings where id = pg_temp.m('v4')),
          '16668/18/3000/19668', 'vector 4: 250,000 x1 x2 = 16,668 + 18% 3,000 = 19,668');
-- mixed types: each line its own price, one tax rate, tax rounded once on the total
insert into memo select 'mix', (pg_temp.book('t-vec', 50, 51, '[{"room_type":"single","qty":1},{"room_type":"double","qty":1}]')) ->> 'id';
select is((select amount_stay_inr || '/' || amount_tax_inr from public.stay_bookings where id = pg_temp.m('mix')),
          '517/26', 'mixed: 217 + 300 = 517, 5% = 25.85 -> 26');

-- returned shape (StayBookingRow)
select is((select array_agg(k order by k collate "C") from jsonb_object_keys(public.get_stay_booking(pg_temp.m('mix'))) k),
          array['cancel_reason','cancelled_at','checkin','checkout','created_at','free_cancel_until','grand_total_inr','guest_email',
                'guest_name','guest_phone','guests','hold_expires_at','id','lines','listing','nights','paid','payment_mode',
                'refund_inr','refund_status','special_requests','status','stay_total_inr','tax_inr','tax_percent']::text[],
          'booking JSON has exactly the StayBookingRow fields');
select is(public.get_stay_booking(pg_temp.m('mix')) -> 'lines',
          '[{"room_type":"single","label":"Single room","units":1,"unit_price_inr":217,"nights":1,"line_total_inr":217},
            {"room_type":"double","label":"Double sharing","units":1,"unit_price_inr":300,"nights":1,"line_total_inr":300}]'::jsonb,
          'lines carry label, unit price, nights and line total');
select is(public.get_stay_booking(pg_temp.m('mix')) ->> 'guest_email', 'asha@example.com', 'e-mail is stored lower-case');
select is(public.get_stay_booking(pg_temp.m('mix')) ->> 'status', 'confirmed', 'pay at the property: confirmed at once');

-- ───────── input checks ─────────
select throws_ok($$ select pg_temp.book('t-vec', 40, 41, '[{"room_type":"double","qty":9}]') $$, 'ZV422', null, 'at most 8 beds');
select throws_ok($$ select pg_temp.book('t-vec', 40, 41, '[{"room_type":"double","qty":1},{"room_type":"double","qty":1}]') $$, 'ZV422', null, 'each type once');
select throws_ok($$ select pg_temp.book('t-vec', 40, 41, '[{"room_type":"suite","qty":1}]') $$, 'ZV422', null, 'unknown room type');
select throws_ok($$ select pg_temp.book('t-vec', 40, 41, '[{"room_type":"double"}]') $$, 'ZV422', null, 'quantity required');
select throws_ok($$ select pg_temp.book('t-vec', 40, 41, '[{"room_type":"double","qty":0}]') $$, 'ZV422', null, 'quantity at least 1');
select throws_ok($$ select pg_temp.book('t-vec', 40, 41, '[]') $$, 'ZV422', null, 'a bed must be chosen');
select throws_ok($$ select pg_temp.book('t-vec', -1, 1, '[{"room_type":"double","qty":1}]') $$, 'ZV422', null, 'no past check-in');
select throws_ok($$ select pg_temp.book('t-vec', 366, 367, '[{"room_type":"double","qty":1}]') $$, 'ZV422', null, 'at most a year ahead');
select throws_ok($$ select pg_temp.book('t-vec', 10, 41, '[{"room_type":"double","qty":1}]') $$, 'ZV422', null, 'at most 30 nights');
select throws_ok($$ select pg_temp.book('t-off', 10, 11, '[{"room_type":"single","qty":1}]') $$, 'ZV404', null, 'inactive listing cannot be booked');
select throws_ok($$ select public.book_stay('t-vec', pg_temp.d(40), pg_temp.d(41), '[{"room_type":"double","qty":1}]', 'A', '9876543210', 'a@b.co', null, 'at_property') $$,
                 'ZV422', null, 'name of at least 2 characters');
select throws_ok($$ select public.book_stay('t-vec', pg_temp.d(40), pg_temp.d(41), '[{"room_type":"double","qty":1}]', 'Asha', '12345', 'a@b.co', null, 'at_property') $$,
                 'ZV422', null, '10-digit Indian mobile');
select throws_ok($$ select public.book_stay('t-vec', pg_temp.d(40), pg_temp.d(41), '[{"room_type":"double","qty":1}]', 'Asha', '9876543210', 'not-an-email', null, 'at_property') $$,
                 'ZV422', null, 'valid e-mail');
select throws_ok($$ select pg_temp.book('t-vec', 40, 41, '[{"room_type":"double","qty":1}]', 'cash') $$, 'ZV422', null, 'known payment mode');

-- ───────── nightly capacity: overlapping and adjacent ranges ─────────
-- t-cap has 2 double beds. A takes both for nights 20..22 (check-out 23).
insert into memo select 'cap', (pg_temp.book('t-cap', 20, 23, '[{"room_type":"double","qty":2}]')) ->> 'id';
select tests.act_as('sb@test.zuvio');
select throws_ok($$ select pg_temp.book('t-cap', 22, 24, '[{"room_type":"double","qty":1}]') $$, 'ZV409', null, 'overlapping last night: sold out');
select throws_ok($$ select pg_temp.book('t-cap', 18, 21, '[{"room_type":"double","qty":1}]') $$, 'ZV409', null, 'overlapping first night: sold out');
select lives_ok($$ select pg_temp.book('t-cap', 23, 25, '[{"room_type":"double","qty":2}]') $$, 'check-out day is free for the next check-in');
select lives_ok($$ select pg_temp.book('t-cap', 18, 20, '[{"room_type":"double","qty":2}]') $$, 'a stay ending on the check-in day fits');
select is((public.stay_availability('t-cap', pg_temp.d(19), pg_temp.d(24)) -> 0 ->> 'units_left')::integer, 0, 'availability reports 0 left over a full range');
select is((public.stay_availability('t-cap', pg_temp.d(17), pg_temp.d(18)) -> 0 ->> 'units_left')::integer, 2, 'free nights report full capacity');
select is((select array_agg((n ->> 'units_left')::integer) from jsonb_array_elements(public.stay_availability('t-cap', pg_temp.d(16), pg_temp.d(17)) -> 0 -> 'strip') n),
          array[2, 2, 0, 0, 0, 0, 0], 'strip shows units per night from check-in');
select is((select sum(it.units)::integer from public.stay_booking_items it join public.stay_bookings b on b.id = it.booking_id
            where b.listing_ref = 't-cap' and b.check_in <= pg_temp.d(21) and b.check_out > pg_temp.d(21) and b.status = 'confirmed'),
          null, 'B cannot see A''s bookings through RLS');

-- ───────── privacy: own rows only, even for staff ─────────
select is((select count(*)::integer from public.stay_bookings where id = pg_temp.m('cap')), 0, 'another guest cannot read the row');
select is(public.get_stay_booking(pg_temp.m('cap')), null, 'get_stay_booking: another guest gets nothing');
select ok(not exists (select 1 from jsonb_array_elements(public.my_stay_bookings()) b where b ->> 'id' = pg_temp.m('cap')::text), 'my_stay_bookings: only own');
select throws_ok($$ select public.cancel_stay(pg_temp.m('cap'), 'mine now') $$, 'ZV404', null, 'cannot cancel another guest''s booking');
select tests.act_as('sstaff@test.zuvio');
select is((select count(*)::integer from public.stay_bookings where id = pg_temp.m('cap')), 1, 'staff can read rows through RLS');
select is(public.get_stay_booking(pg_temp.m('cap')), null, 'get_stay_booking stays own-only for staff');
select is(public.my_stay_bookings(), '[]'::jsonb, 'my_stay_bookings stays own-only for staff');
select throws_ok($$ select public.cancel_stay(pg_temp.m('cap'), 'staff') $$, 'ZV404', null, 'cancel_stay stays own-only for staff');
select is(public.staff_get_stay_booking(pg_temp.m('cap')) ->> 'id', pg_temp.m('cap')::text, 'staff_get_stay_booking shows any booking to staff');
select tests.act_as('sa@test.zuvio');
select throws_ok($$ select public.staff_get_stay_booking(pg_temp.m('cap')) $$, 'ZV403', null, 'staff_get_stay_booking is staff only');
select ok(exists (select 1 from jsonb_array_elements(public.my_stay_bookings()) b where b ->> 'id' = pg_temp.m('cap')::text), 'the guest sees their own');

-- ───────── suspended users ─────────
select tests.act_as('ssus@test.zuvio');
select throws_ok($$ select pg_temp.book('t-vec', 60, 61, '[{"room_type":"double","qty":1}]') $$, 'ZV423', null, 'a suspended user cannot book');
select tests.act_as_anon();
select throws_ok($$ select public.my_stay_bookings() $$, '42501', null, 'anon cannot list bookings');

-- ───────── online holds ─────────
select tests.act_as('sb@test.zuvio');
insert into memo select 'hold', (pg_temp.book('t-cap', 30, 32, '[{"room_type":"double","qty":2}]', 'online')) ->> 'id';
select is(public.get_stay_booking(pg_temp.m('hold')) ->> 'status', 'pending_payment', 'online: held while paying');
select isnt(public.get_stay_booking(pg_temp.m('hold')) ->> 'hold_expires_at', null, 'the hold has an end');
select tests.act_as('sa@test.zuvio');
select throws_ok($$ select pg_temp.book('t-cap', 31, 32, '[{"room_type":"double","qty":1}]') $$, 'ZV409', null, 'a live hold blocks the beds');
-- the hold runs out
select tests.act_as_owner();
update public.stay_bookings set hold_expires_at = now() - interval '1 minute' where id = pg_temp.m('hold');
select tests.act_as('sa@test.zuvio');
select is((public.stay_availability('t-cap', pg_temp.d(30), pg_temp.d(32)) -> 0 ->> 'units_left')::integer, 2, 'an expired hold frees the beds at once');
select tests.act_as_service();
select ok(public.expire_stay_holds() >= 1, 'expiry job closes the hold');
select tests.act_as_owner();
select is((select status from public.stay_bookings where id = pg_temp.m('hold')), 'expired', 'the hold is now expired');

-- at most 3 live holds per guest
select tests.act_as('sb@test.zuvio');
select pg_temp.book('t-vec', 70, 71, '[{"room_type":"single","qty":1}]', 'online');
select pg_temp.book('t-vec', 72, 73, '[{"room_type":"single","qty":1}]', 'online');
select pg_temp.book('t-vec', 74, 75, '[{"room_type":"single","qty":1}]', 'online');
select throws_ok($$ select pg_temp.book('t-vec', 76, 77, '[{"room_type":"single","qty":1}]', 'online') $$, 'ZV409', null, 'a fourth open hold is refused');

-- online-only switch
select tests.act_as_owner();
update public.stay_settings set online_payment_only = true;
select tests.act_as('sa@test.zuvio');
select throws_ok($$ select pg_temp.book('t-vec', 80, 81, '[{"room_type":"double","qty":1}]') $$, 'ZV422', null, 'pay at property refused once online payment is required');
select tests.act_as_owner();
update public.stay_settings set online_payment_only = false;

-- ───────── payments ─────────
select tests.act_as('sa@test.zuvio');
insert into memo select 'pay', (pg_temp.book('t-vec', 30, 32, '[{"room_type":"double","qty":1}]', 'online')) ->> 'id';
select tests.act_as_service();
select is(public.stay_payment_state(pg_temp.m('pay')) ->> 'payable', 'true', 'a fresh hold is payable');
select is(public.record_stay_order(pg_temp.m('pay'), 'order_1', 63000), 'order_1', 'order recorded');
select is(public.record_stay_order(pg_temp.m('pay'), 'order_2', 63000), 'order_1', 'a second order re-uses the first');
select throws_ok($$ select public.record_stay_order(pg_temp.m('pay'), 'order_3', 100) $$, 'ZV422', null, 'order amount must match');
select throws_ok($$ select public.mark_stay_paid('order_1', 'pay_1', 100) $$, 'ZV422', null, 'paid amount must match');
select throws_ok($$ select public.mark_stay_paid('order_x', 'pay_1', 63000) $$, 'ZV404', null, 'unknown order');
select is(public.mark_stay_paid('order_1', 'pay_1', 63000) ->> 'outcome', 'confirmed', 'payment confirms the booking');
select is(public.mark_stay_paid('order_1', 'pay_1', 63000) ->> 'outcome', 'already_paid', 'idempotent for the same payment');
select is(public.mark_stay_paid('order_1', 'pay_2', 63000) ->> 'outcome', 'duplicate', 'a second payment is flagged for refund');
select is(public.stay_payment_state(pg_temp.m('pay')) ->> 'payable', 'false', 'paid: no longer payable');
select tests.act_as('sa@test.zuvio');
select is(public.get_stay_booking(pg_temp.m('pay')) ->> 'paid', 'true', 'the guest sees it paid');
select is(public.get_stay_booking(pg_temp.m('pay')) ->> 'status', 'confirmed', 'and confirmed');

-- paid after the hold ran out: honoured while the beds are still free
insert into memo select 'late', (pg_temp.book('t-vec', 90, 91, '[{"room_type":"triple","qty":1}]', 'online')) ->> 'id';
select tests.act_as_service();
select public.record_stay_order(pg_temp.m('late'), 'order_late', 42000);
select tests.act_as_owner();
update public.stay_bookings set hold_expires_at = now() - interval '1 minute' where id = pg_temp.m('late');
select tests.act_as_service();
select public.expire_stay_holds();
select is(public.mark_stay_paid('order_late', 'pay_late', 42000) ->> 'outcome', 'confirmed', 'late payment confirms when beds are still free');

-- paid after the beds went to someone else: refund
select tests.act_as('sa@test.zuvio');
insert into memo select 'lost', (pg_temp.book('t-cap', 100, 101, '[{"room_type":"double","qty":2}]', 'online')) ->> 'id';
select tests.act_as_service();
select public.record_stay_order(pg_temp.m('lost'), 'order_lost', 63000);
select tests.act_as_owner();
update public.stay_bookings set hold_expires_at = now() - interval '1 minute' where id = pg_temp.m('lost');
select tests.act_as('sb@test.zuvio');
select pg_temp.book('t-cap', 100, 101, '[{"room_type":"double","qty":1}]');
select tests.act_as_service();
select is(public.mark_stay_paid('order_lost', 'pay_lost', 63000) ->> 'outcome', 'refund_needed', 'beds gone: payment must be refunded');
select tests.act_as_owner();
select is((select status || '/' || refund_status || '/' || refund_inr from public.stay_bookings where id = pg_temp.m('lost')),
          'expired/refund_due/630', 'recorded as refund_due for the full amount');
select tests.act_as_service();
select public.mark_stay_refund(pg_temp.m('lost'), 'refunded', 'rfnd_1');
select tests.act_as_owner();
select is((select refund_status from public.stay_bookings where id = pg_temp.m('lost')), 'refunded', 'refund outcome recorded');

-- ───────── cancellation by policy ─────────
select tests.act_as('sa@test.zuvio');
-- paid online, 30 days ahead: 100%
select is((public.cancel_stay(pg_temp.m('pay'), 'Plans changed')) ->> 'refund_percent', '100', 'cancelled 30 days ahead: full refund');
select is((select refund_status || '/' || refund_inr from public.stay_bookings where id = pg_temp.m('pay')), 'refund_due/630', 'refund recorded as due');
select throws_ok($$ select public.cancel_stay(pg_temp.m('pay'), null) $$, 'ZV409', null, 'cannot cancel twice');
-- paid online, 3 days ahead: 0%
insert into memo select 'soon', (pg_temp.book('t-vec', 3, 4, '[{"room_type":"double","qty":1}]', 'online')) ->> 'id';
select tests.act_as_service();
select public.record_stay_order(pg_temp.m('soon'), 'order_soon', 31500);
select public.mark_stay_paid('order_soon', 'pay_soon', 31500);
select tests.act_as('sa@test.zuvio');
select is((public.cancel_stay(pg_temp.m('soon'), null)) ->> 'refund_percent', '0', 'cancelled 3 days ahead: no refund');
select is((select refund_status || '/' || refund_inr from public.stay_bookings where id = pg_temp.m('soon')), 'none/0', 'nothing to refund');
-- pay at the property: nothing to refund, beds freed
select is((public.cancel_stay(pg_temp.m('cap'), null)) -> 'booking' ->> 'status', 'cancelled', 'pay-at-property booking cancels');
select is((public.stay_availability('t-cap', pg_temp.d(20), pg_temp.d(23)) -> 0 ->> 'units_left')::integer, 2, 'cancelling frees the beds');
-- after check-in
select tests.act_as_owner();
update public.stay_bookings set check_in = public.stay_today() - 1, check_out = public.stay_today() + 1, nights = 2 where id = pg_temp.m('v2');
select tests.act_as('sa@test.zuvio');
select throws_ok($$ select public.cancel_stay(pg_temp.m('v2'), null) $$, 'ZV409', null, 'cannot cancel after check-in');
-- paid after cancellation: refund
select tests.act_as('sa@test.zuvio');
insert into memo select 'cxl', (pg_temp.book('t-lux', 120, 121, '[{"room_type":"single","qty":1}]', 'online')) ->> 'id';
select tests.act_as_service();
select public.record_stay_order(pg_temp.m('cxl'), 'order_cxl', (select amount_total_inr::bigint * 100 from public.stay_bookings where id = pg_temp.m('cxl')));
select tests.act_as('sa@test.zuvio');
select public.cancel_stay(pg_temp.m('cxl'), null);
select tests.act_as_service();
select is(public.mark_stay_paid('order_cxl', 'pay_cxl', (select amount_total_inr::bigint * 100 from public.stay_bookings where id = pg_temp.m('cxl'))) ->> 'outcome',
          'refund_needed', 'money after cancellation is refunded');

select * from finish();
rollback;
