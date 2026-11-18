-- Stay bookings: limits against bed hoarding, staff release, receipt numbers.
begin;
select * from no_plan();

select tests.create_user('cap-a@test.zuvio', '{"full_name":"Cap A"}'::jsonb);
select tests.create_user('cap-b@test.zuvio', '{"full_name":"Cap B"}'::jsonb);
select tests.create_user('cap-staff@test.zuvio', '{"full_name":"Cap Staff"}'::jsonb);
select tests.grant_role(tests.user_id('cap-staff@test.zuvio'), 'admin');
select tests.create_user('crowd' || g || '@test.zuvio') from generate_series(1, 13) g;

create temp table memo (k text primary key, v text);
grant all on memo to anon, authenticated, service_role;
create function pg_temp.m(p_k text) returns uuid language sql stable as 'select v::uuid from memo where k = p_k';
grant execute on function pg_temp.m(text) to anon, authenticated, service_role;
create function pg_temp.d(p_n integer) returns date language sql stable as 'select public.stay_today() + p_n';
grant execute on function pg_temp.d(integer) to anon, authenticated, service_role;
create function pg_temp.book(p_listing text, p_in integer, p_mode text default 'at_property')
returns jsonb language sql volatile as
  $f$ select public.book_stay(p_listing, pg_temp.d(p_in), pg_temp.d(p_in + 1), '[{"room_type":"double","qty":1}]',
                              'Cap Guest', '9876543210', 'cap@example.com', null, p_mode) $f$;
grant execute on function pg_temp.book(text, integer, text) to anon, authenticated, service_role;

insert into public.stay_inventory (listing_ref, room_type, units, rent_per_month)
select l, 'double', 50, 9000 from unnest(array['c-1', 'c-2', 'c-3', 'c-4', 'c-crowd']) l;

-- ───────── schema ─────────
select has_trigger('public', 'stay_bookings', 'stay_bookings_abuse_caps', 'abuse caps run on every new booking');
select has_trigger('public', 'stay_bookings', 'stay_bookings_issue_invoice', 'receipts are issued by trigger');
select ok((select relrowsecurity from pg_class where oid = 'public.stay_invoices'::regclass), 'stay_invoices has RLS');
select ok(not has_table_privilege('authenticated', 'public.stay_invoices', 'insert,update,delete'), 'no client writes on receipts');
select ok(not has_function_privilege('authenticated', 'public.service_get_stay_invoice(uuid)', 'execute'), 'users cannot read any receipt');
select ok(not has_function_privilege('anon', 'public.get_stay_invoice(uuid)', 'execute'), 'anon cannot read receipts');
select ok(not has_function_privilege('anon', 'public.staff_release_stay(uuid,text)', 'execute'), 'anon cannot release bookings');

-- ───────── pay at the property: 1 per listing, 2 upcoming ─────────
select tests.act_as('cap-a@test.zuvio');
insert into memo select 'a1', (pg_temp.book('c-1', 10)) ->> 'id';
select throws_ok($$ select pg_temp.book('c-1', 20) $$, 'ZV409', null, 'one upcoming pay-at-property booking per listing');
insert into memo select 'a2', (pg_temp.book('c-2', 10)) ->> 'id';
select throws_ok($$ select pg_temp.book('c-3', 10) $$, 'ZV409', null, 'at most 2 upcoming pay-at-property bookings');
select lives_ok($$ select pg_temp.book('c-3', 10, 'online') $$, 'online holds are not limited by the pay-at-property cap');
select public.cancel_stay(pg_temp.m('a1'), null);
select lives_ok($$ select pg_temp.book('c-3', 12) $$, 'cancelling one frees a slot');
-- a stay that has ended no longer counts
select tests.act_as_owner();
update public.stay_bookings set check_in = public.stay_today() - 3, check_out = public.stay_today() - 1, nights = 2
 where id = pg_temp.m('a2');
select tests.act_as('cap-a@test.zuvio');
select lives_ok($$ select pg_temp.book('c-2', 30) $$, 'past stays do not count as upcoming');

-- ───────── 3 bookings per guest per listing per day (hold churn) ─────────
select tests.act_as('cap-b@test.zuvio');
select pg_temp.book('c-4', 40, 'online');
select pg_temp.book('c-4', 42, 'online');
select pg_temp.book('c-4', 44, 'online');
select tests.act_as_owner();
update public.stay_bookings set hold_expires_at = now() - interval '1 minute'
 where user_id = tests.user_id('cap-b@test.zuvio') and status = 'pending_payment';
select tests.act_as('cap-b@test.zuvio');
select throws_ok($$ select pg_temp.book('c-4', 46, 'online') $$, 'ZV429', null, 'a 4th booking of one listing in 24 hours is refused');

-- ───────── 12 pay-at-property bookings per listing per day, all guests ─────────
do $$
begin
  for g in 1..12 loop
    perform tests.act_as('crowd' || g || '@test.zuvio');
    perform pg_temp.book('c-crowd', 50 + g);
  end loop;
end
$$;
select tests.act_as('crowd13@test.zuvio');
select throws_ok($$ select pg_temp.book('c-crowd', 70) $$, 'ZV429', null, 'a listing takes at most 12 pay-at-property bookings a day');

-- ───────── receipts ─────────
select tests.act_as('cap-a@test.zuvio');
select matches(public.get_stay_invoice(pg_temp.m('a1')) ->> 'invoice_no', '^ZV-[0-9]{6}-[0-9]{6}$', 'pay-at-property booking has a receipt number');
select is(public.get_stay_invoice(pg_temp.m('a1')) -> 'booking' ->> 'status', 'cancelled', 'the receipt shows the live status');
insert into memo select 'on', (pg_temp.book('c-1', 60, 'online')) ->> 'id';
select is(public.get_stay_invoice(pg_temp.m('on')), null, 'no receipt while waiting for payment');
select tests.act_as_service();
select public.record_stay_order(pg_temp.m('on'), 'order_cap', 31500);
select public.mark_stay_paid('order_cap', 'pay_cap', 31500);
select isnt(public.service_get_stay_invoice(pg_temp.m('on')), null, 'the server can read the receipt for e-mail');
select tests.act_as('cap-a@test.zuvio');
insert into memo select 'no', public.get_stay_invoice(pg_temp.m('on')) ->> 'invoice_no';
select isnt((select v from memo where k = 'no'), null, 'receipt issued when the payment confirms the booking');
select is(public.get_stay_invoice(pg_temp.m('on')) -> 'booking' ->> 'paid', 'true', 'and it shows paid');
select tests.act_as_owner();
update public.stay_bookings set status = 'completed' where id = pg_temp.m('on');
select tests.act_as('cap-a@test.zuvio');
select is(public.get_stay_invoice(pg_temp.m('on')) ->> 'invoice_no', (select v from memo where k = 'no'), 'the number never changes');
select tests.act_as('cap-b@test.zuvio');
select is(public.get_stay_invoice(pg_temp.m('on')), null, 'another guest gets nothing');
select is((select count(*)::integer from public.stay_invoices where booking_id = pg_temp.m('on')), 0, 'another guest cannot read the row');
select tests.act_as('cap-staff@test.zuvio');
select is(public.get_stay_invoice(pg_temp.m('on')), null, 'get_stay_invoice stays own-only for staff');

-- ───────── staff release ─────────
select tests.act_as('cap-a@test.zuvio');
select throws_ok($$ select public.staff_release_stay(pg_temp.m('a2'), 'Hoarding beds') $$, 'ZV403', null, 'guests cannot release bookings');
select throws_ok($$ select public.staff_list_stay_bookings() $$, 'ZV403', null, 'guests cannot list all bookings');
insert into memo select 'rel', (pg_temp.book('c-4', 80, 'online')) ->> 'id';
select tests.act_as_service();
select public.record_stay_order(pg_temp.m('rel'), 'order_rel', 31500);
select public.mark_stay_paid('order_rel', 'pay_rel', 31500);
select tests.act_as('cap-staff@test.zuvio');
select throws_ok($$ select public.staff_release_stay(pg_temp.m('rel'), 'x') $$, 'ZV422', null, 'a reason is required');
select is(public.staff_release_stay(pg_temp.m('rel'), 'Duplicate booking') ->> 'status', 'cancelled', 'staff release cancels');
select is((select refund_status || '/' || refund_inr from public.stay_bookings where id = pg_temp.m('rel')), 'refund_due/315',
          'money paid online is due back in full');
select throws_ok($$ select public.staff_release_stay(pg_temp.m('rel'), 'Again') $$, 'ZV409', null, 'cannot release twice');
select ok(jsonb_array_length(public.staff_list_stay_bookings('c-crowd')) = 12, 'staff list filters by listing');
select tests.act_as_owner();
select ok(exists (select 1 from public.notifications n where n.user_id = tests.user_id('cap-a@test.zuvio')
                   and n.title = 'Your stay booking was cancelled by Zovia'), 'the guest is told');

select * from finish();
rollback;
