-- Request → accept → pay bookings: one live booking per whole home, refunds for money that cannot
-- be honoured, expiry that sticks, no cancelling while a payment is in flight.
begin;
select * from no_plan();

select tests.create_user('fo@test.zuvio', '{"full_name":"Fix Owner"}'::jsonb);
select tests.create_user('f1@test.zuvio', '{"full_name":"Seeker One"}'::jsonb);
select tests.create_user('f2@test.zuvio', '{"full_name":"Seeker Two"}'::jsonb);
select tests.make_owner(tests.user_id('fo@test.zuvio'));

create temp table memo (k text primary key, v text);
grant all on memo to anon, authenticated, service_role;
create function pg_temp.m(p_k text) returns uuid language sql stable as 'select v::uuid from memo where k = p_k';
grant execute on function pg_temp.m(text) to anon, authenticated, service_role;
create function pg_temp.today() returns date language sql stable as $f$ select (now() at time zone 'Asia/Kolkata')::date $f$;
grant execute on function pg_temp.today() to anon, authenticated, service_role;

insert into memo select 'home', tests.create_property(tests.user_id('fo@test.zuvio'), 'Whole Home', 'entire_unit')::text;
select tests.set_listing_status(pg_temp.m('home'), 'published');
insert into public.property_availability (property_id, status) values (pg_temp.m('home'), 'available')
  on conflict (property_id) do update set status = 'available', available_from = null;

-- schema
select ok(exists (select 1 from pg_indexes where indexname = 'bookings_one_live_per_unit'), 'one live booking per whole home');
select ok(not has_function_privilege('authenticated', 'public.mark_payment_refund(text,text,text)', 'execute'), 'users cannot mark refunds');
select ok(not has_function_privilege('authenticated', 'public.open_payment_order(uuid)', 'execute'), 'users cannot read open orders');
select ok(has_function_privilege('service_role', 'public.expire_stale_bookings()', 'execute'), 'the server can run the booking expiry');

-- two seekers request the same home
select tests.act_as('f1@test.zuvio');
insert into memo select 'b1', public.request_booking(pg_temp.m('home'), pg_temp.today() + 10, 6::smallint)::text;
select tests.act_as('f2@test.zuvio');
insert into memo select 'b2', public.request_booking(pg_temp.m('home'), pg_temp.today() + 10, 6::smallint)::text;
select throws_ok($$ select public.request_booking(pg_temp.m('home'), pg_temp.today() - 1, 6::smallint) $$, 'ZV422', null, 'move-in uses the India date: no past dates');

-- the owner can accept only one
select tests.act_as('fo@test.zuvio');
select is(public.owner_respond_booking(pg_temp.m('b1'), true), 'accepted', 'first request accepted');
select throws_ok($$ select public.owner_respond_booking(pg_temp.m('b2'), true) $$, 'ZV409', null, 'second accept for the same home is refused');
select is((select status::text from public.bookings where id = pg_temp.m('b2')), 'requested', 'the second request is still open');
select tests.act_as('f2@test.zuvio');
select throws_ok($$ select public.request_booking(pg_temp.m('home'), pg_temp.today() + 20, 6::smallint) $$, 'ZV409', null, 'new requests see the home as taken');

-- expired requests: the expiry sticks and the owner is told
select tests.act_as_owner();
update public.bookings set respond_by = now() - interval '1 minute' where id = pg_temp.m('b2');
select tests.act_as('fo@test.zuvio');
select is(public.owner_respond_booking(pg_temp.m('b2'), false, 'Too late'), 'expired', 'answering an expired request says so');
select is((select status::text from public.bookings where id = pg_temp.m('b2')), 'expired', 'and the expiry is kept');

-- payment orders: re-used, and cancel waits while a payment is in flight
select tests.act_as_service();
select public.record_payment_order(pg_temp.m('b1'), 'ord_a', (select amount_inr::bigint * 100 from public.bookings where id = pg_temp.m('b1')));
select is(public.open_payment_order(pg_temp.m('b1')), 'ord_a', 'the open order is found for re-use');
select tests.act_as('f1@test.zuvio');
select throws_ok($$ select public.cancel_booking(pg_temp.m('b1'), 'changed my mind') $$, 'ZV409', null, 'no cancelling while a payment is in flight');

-- confirm: once, then refunds for anything else
select tests.act_as_service();
select throws_ok($$ select public.confirm_booking_payment('ord_a', 'pay_a', 1) $$, 'ZV422', null, 'amount must match the order');
select is(public.confirm_booking_payment('ord_a', 'pay_a', (select amount_inr::bigint * 100 from public.bookings where id = pg_temp.m('b1'))) ->> 'outcome',
          'confirmed', 'payment confirms the booking');
select is(public.confirm_booking_payment('ord_a', 'pay_a', (select amount_inr::bigint * 100 from public.bookings where id = pg_temp.m('b1'))) ->> 'outcome',
          'already_paid', 'same payment again: idempotent');
select is(public.confirm_booking_payment('ord_a', 'pay_a2', (select amount_inr::bigint * 100 from public.bookings where id = pg_temp.m('b1'))) ->> 'outcome',
          'duplicate', 'another payment on a paid order: refund it');
-- a second order for the same booking (another tab) is paid too: refund, booking untouched
select tests.act_as_owner();
insert into public.payments (booking_id, provider_order_id, amount_paise)
  select pg_temp.m('b1'), 'ord_b', amount_inr::bigint * 100 from public.bookings where id = pg_temp.m('b1');
select tests.act_as_service();
select is(public.confirm_booking_payment('ord_b', 'pay_b', (select amount_inr::bigint * 100 from public.bookings where id = pg_temp.m('b1'))) ->> 'outcome',
          'refund_needed', 'second order paid: refund needed');
select is((select refund_status from public.payments where provider_order_id = 'ord_b'), 'refund_due', 'marked refund_due');
select public.mark_payment_refund('ord_b', 'refunded', 'rfnd_b');
select is((select status::text || '/' || refund_status from public.payments where provider_order_id = 'ord_b'), 'refunded/refunded', 'refund recorded');
select is((select count(*)::integer from public.payments where booking_id = pg_temp.m('b1') and status = 'paid'), 1, 'exactly one payment kept');
select is((select status::text from public.bookings where id = pg_temp.m('b1')), 'confirmed', 'booking stays confirmed');

select * from finish();
rollback;
