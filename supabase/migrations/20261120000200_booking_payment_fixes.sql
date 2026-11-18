-- Fixes in the request → accept → pay booking flow (20261112000500_bookings_payments.sql).
--
-- 1. A whole home could be accepted for, and paid by, two seekers: only one live accepted or
--    confirmed booking per entire-unit listing now (the per-bed index already covers beds).
-- 2. Money for a booking that cannot be honoured (paid twice, or after it was cancelled or expired)
--    was marked paid and forgotten. It is now flagged refund_due and reported to the server, which
--    refunds it through the provider. A booking cannot be cancelled while a payment is in flight.
-- 3. An owner answering an expired request got an error, and the expiry was rolled back with it,
--    so the request held the bed forever. The expiry now sticks and the function says so.
-- 4. Dates are India dates, not current_date (UTC on Supabase).

-- ───────────────────────────── 1. one live booking per whole home ─────────────────────────────
create unique index bookings_one_live_per_unit on public.bookings (property_id)
  where bed_id is null and status in ('accepted', 'confirmed');

-- Missing housekeeping the schema tests ask for.
comment on table public.bookings is 'Long-stay bookings of owner listings: request, owner accepts, seeker pays, confirmed. Written only through SECURITY DEFINER functions.';
comment on table public.payments is 'Provider orders and payments for bookings, with refund tracking. Written only by the trusted server path (service role).';
create index if not exists bookings_cancelled_by_idx on public.bookings (cancelled_by);

-- ───────────────────────────── 2. refund tracking on payments ─────────────────────────────
alter table public.payments
  add column refund_status text not null default 'none',
  add column provider_refund_id text,
  add constraint payments_refund_status check (refund_status in ('none', 'pending', 'refunded', 'refund_due'));
create index payments_refund_due_idx on public.payments (created_at) where refund_status = 'refund_due';

-- ───────────────────────────── request_booking (India dates) ─────────────────────────────
create or replace function public.request_booking(
  p_property_id  uuid,
  p_move_in_date date,
  p_stay_months  smallint,
  p_bed_id       uuid default null,
  p_note         text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
set statement_timeout = '10s'
as $$
declare
  v_uid     uuid := auth.uid();
  v_today   date := (now() at time zone 'Asia/Kolkata')::date;
  v_prop    public.properties;
  v_bed     public.beds;
  v_room    public.rooms;
  v_rent    integer;
  v_deposit integer;
  v_amount  integer;
  v_kind    public.booking_amount_kind;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception using errcode = 'ZV401', message = 'Please sign in to book.';
  end if;
  if not public.is_active_user() then
    raise exception using errcode = 'ZV423', message = 'Your account cannot make bookings right now.';
  end if;
  select * into v_prop from public.properties
   where id = p_property_id and status = 'published' and deleted_at is null;
  if not found then
    raise exception using errcode = 'ZV404', message = 'Listing not found.';
  end if;
  if v_prop.owner_id = v_uid then
    raise exception using errcode = 'ZV409', message = 'You cannot book your own listing.';
  end if;
  if p_move_in_date is null or p_move_in_date < v_today or p_move_in_date > v_today + 180 then
    raise exception using errcode = 'ZV422', message = 'Choose a move-in date within the next 6 months.';
  end if;
  if p_stay_months is null or p_stay_months not between 1 and 36 then
    raise exception using errcode = 'ZV422', message = 'Stay must be 1 to 36 months.';
  end if;
  if not public.consume_rate_limit('booking_request', 10, 86400) then
    raise exception using errcode = 'ZV429', message = 'You have sent many booking requests today.';
  end if;

  if v_prop.listing_mode = 'per_bed' then
    if p_bed_id is null then
      raise exception using errcode = 'ZV422', message = 'Choose a bed to book.';
    end if;
    select * into v_bed from public.beds where id = p_bed_id and property_id = p_property_id for update;
    if not found then
      raise exception using errcode = 'ZV404', message = 'That bed is not part of this listing.';
    end if;
    if v_bed.status <> 'available' or (v_bed.available_from is not null and v_bed.available_from > p_move_in_date) then
      raise exception using errcode = 'ZV409', message = 'That bed is not available from your move-in date.';
    end if;
    select * into v_room from public.rooms where id = v_bed.room_id and deleted_at is null;
    v_rent := coalesce(v_bed.rent_override, v_room.rent_per_bed);
    v_deposit := v_room.security_deposit;
  else
    if p_bed_id is not null then
      raise exception using errcode = 'ZV422', message = 'This listing is let as a whole unit.';
    end if;
    if not exists (select 1 from public.property_availability a
                    where a.property_id = p_property_id and a.status in ('available', 'limited', 'coming_soon')
                      and (a.available_from is null or a.available_from <= p_move_in_date)) then
      raise exception using errcode = 'ZV409', message = 'This home is not available from your move-in date.';
    end if;
    if exists (select 1 from public.bookings b where b.property_id = p_property_id and b.bed_id is null
                and b.status in ('accepted', 'confirmed')) then
      raise exception using errcode = 'ZV409', message = 'This home has already been booked.';
    end if;
    v_rent := v_prop.monthly_rent;
    v_deposit := v_prop.security_deposit;
  end if;

  if v_rent is null or v_rent <= 0 then
    raise exception using errcode = 'ZV409', message = 'The owner has not set a rent for this yet.';
  end if;
  if v_deposit is not null and v_deposit > 0 then
    v_amount := v_deposit; v_kind := 'security_deposit';
  else
    v_amount := v_rent; v_kind := 'first_month_rent';
  end if;

  begin
    insert into public.bookings (property_id, seeker_id, owner_id, room_id, bed_id, move_in_date, stay_months, note,
                                 amount_inr, amount_kind, monthly_rent_inr, respond_by)
    values (p_property_id, v_uid, v_prop.owner_id, v_room.id, v_bed.id, p_move_in_date, p_stay_months,
            nullif(btrim(p_note), ''), v_amount, v_kind, v_rent, now() + interval '48 hours')
    returning id into v_id;
  exception when unique_violation then
    raise exception using errcode = 'ZV409', message = 'You already have an open booking for this listing, or the bed was just taken.';
  end;

  perform public.notify(v_prop.owner_id, 'system', 'New booking request', v_prop.title, '/owner/bookings');
  return v_id;
end
$$;

-- ───────────────────────────── 3. owner_respond_booking ─────────────────────────────
-- Returns the new status: 'accepted', 'declined' or 'expired' (the request ran out before the
-- answer; the expiry is kept and the app tells the owner).
drop function public.owner_respond_booking(uuid, boolean, text);
create function public.owner_respond_booking(p_booking_id uuid, p_accept boolean, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
as $$
declare
  v_b public.bookings;
begin
  if auth.uid() is null then
    raise exception using errcode = 'ZV401', message = 'Please sign in.';
  end if;
  select * into v_b from public.bookings where id = p_booking_id and owner_id = auth.uid() for update;
  if not found then
    raise exception using errcode = 'ZV404', message = 'Booking not found.';
  end if;
  if v_b.status <> 'requested' then
    raise exception using errcode = 'ZV409', message = 'This request has already been answered.';
  end if;
  if v_b.respond_by < now() then
    update public.bookings set status = 'expired' where id = v_b.id;
    return 'expired';
  end if;
  if not p_accept and (p_reason is null or char_length(btrim(p_reason)) < 3) then
    raise exception using errcode = 'ZV422', message = 'Tell the seeker why (a few words is enough).';
  end if;

  begin
    update public.bookings
       set status = case when p_accept then 'accepted'::public.booking_status else 'declined'::public.booking_status end,
           decided_at = now(),
           pay_by = case when p_accept then now() + interval '48 hours' end,
           decline_reason = case when p_accept then null else btrim(p_reason) end
     where id = v_b.id;
  exception when unique_violation then
    raise exception using errcode = 'ZV409', message = 'You already accepted another request for this home.';
  end;

  perform public.notify(v_b.seeker_id, 'system',
    case when p_accept then 'Booking accepted: complete payment' else 'Booking declined' end,
    case when p_accept then 'Pay within 48 hours to confirm.' else btrim(p_reason) end,
    '/bookings/' || v_b.id::text);
  return case when p_accept then 'accepted' else 'declined' end;
end
$$;
revoke all on function public.owner_respond_booking(uuid, boolean, text) from public, anon;
grant execute on function public.owner_respond_booking(uuid, boolean, text) to authenticated;

-- ───────────────────────────── cancel_booking: not while paying ─────────────────────────────
create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.bookings;
begin
  if auth.uid() is null then
    raise exception using errcode = 'ZV401', message = 'Please sign in.';
  end if;
  select * into v_b from public.bookings
   where id = p_booking_id and (seeker_id = auth.uid() or owner_id = auth.uid()) for update;
  if not found then
    raise exception using errcode = 'ZV404', message = 'Booking not found.';
  end if;
  if v_b.status not in ('requested', 'accepted') then
    raise exception using errcode = 'ZV409', message = 'This booking cannot be cancelled here. Contact support for paid bookings.';
  end if;
  if exists (select 1 from public.payments p where p.booking_id = v_b.id and p.status = 'created'
              and p.updated_at > now() - interval '20 minutes') then
    raise exception using errcode = 'ZV409', message = 'A payment for this booking is in progress. Try again in a few minutes.';
  end if;
  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = nullif(btrim(p_reason), '')
   where id = v_b.id;
  perform public.notify(case when auth.uid() = v_b.seeker_id then v_b.owner_id else v_b.seeker_id end,
                        'system', 'Booking cancelled', nullif(btrim(p_reason), ''),
                        case when auth.uid() = v_b.seeker_id then '/owner/bookings' else '/bookings/' || v_b.id::text end);
end
$$;

-- ───────────────────────────── re-use an open order ─────────────────────────────
-- record_payment_order(): when the server re-uses an order it touches it, which keeps
-- cancel_booking's "payment in progress" window accurate.
create or replace function public.record_payment_order(p_booking_id uuid, p_order_id text, p_amount_paise bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking_id;
  if not found or v_b.status <> 'accepted' then
    raise exception using errcode = 'ZV409', message = 'This booking is not waiting for payment.';
  end if;
  if p_amount_paise <> v_b.amount_inr::bigint * 100 then
    raise exception using errcode = 'ZV422', message = 'Payment amount does not match the booking.';
  end if;
  insert into public.payments (booking_id, provider_order_id, amount_paise)
  values (p_booking_id, p_order_id, p_amount_paise)
  on conflict (provider, provider_order_id) do update set updated_at = now()
    where public.payments.booking_id = excluded.booking_id;
end
$$;

-- The open (unpaid) order of a booking that still matches its amount, if any. service_role only.
create function public.open_payment_order(p_booking_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.provider_order_id
    from public.payments p
    join public.bookings b on b.id = p.booking_id
   where p.booking_id = p_booking_id and p.status = 'created' and p.amount_paise = b.amount_inr::bigint * 100
   order by p.created_at desc
   limit 1
$$;
revoke all on function public.open_payment_order(uuid) from public, anon, authenticated;
grant execute on function public.open_payment_order(uuid) to service_role;

-- ───────────────────────────── confirm_booking_payment ─────────────────────────────
-- Returns { booking_id, outcome }: 'confirmed', 'already_paid', or 'refund_needed' (money for a
-- booking that is no longer waiting for it: the payment is marked refund_due and the server
-- refunds it through the provider).
drop function public.confirm_booking_payment(text, text, bigint);
create function public.confirm_booking_payment(p_order_id text, p_payment_id text, p_amount_paise bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
as $$
declare
  v_p public.payments;
  v_b public.bookings;
begin
  select * into v_p from public.payments where provider = 'razorpay' and provider_order_id = p_order_id for update;
  if not found then
    raise exception using errcode = 'ZV404', message = 'Unknown payment order.';
  end if;
  if v_p.amount_paise <> p_amount_paise then
    raise exception using errcode = 'ZV422', message = 'Paid amount does not match the order.';
  end if;
  select * into v_b from public.bookings where id = v_p.booking_id for update;
  if v_p.status in ('paid', 'refunded') then
    if v_p.provider_payment_id = p_payment_id then
      return jsonb_build_object('booking_id', v_b.id, 'outcome', 'already_paid');
    end if;
    -- A second payment against an order that was already paid: never recorded, refund it.
    return jsonb_build_object('booking_id', v_b.id, 'outcome', 'duplicate');
  end if;

  if v_b.status = 'accepted' and not exists (
       select 1 from public.payments o where o.booking_id = v_b.id and o.id <> v_p.id and o.status = 'paid') then
    update public.payments set status = 'paid', provider_payment_id = p_payment_id, paid_at = now() where id = v_p.id;
    update public.bookings set status = 'confirmed', confirmed_at = now() where id = v_b.id;
    if v_b.bed_id is not null then
      update public.beds set status = 'reserved', available_from = null where id = v_b.bed_id;
    end if;
    perform public.notify(v_b.owner_id, 'system', 'Booking confirmed and paid', null, '/owner/bookings');
    perform public.notify(v_b.seeker_id, 'system', 'Your booking is confirmed', null, '/bookings/' || v_b.id::text);
    return jsonb_build_object('booking_id', v_b.id, 'outcome', 'confirmed');
  end if;

  -- Paid twice, or after the booking was cancelled, declined or expired.
  update public.payments
     set status = 'paid', provider_payment_id = p_payment_id, paid_at = now(), refund_status = 'refund_due'
   where id = v_p.id;
  perform public.notify(v_b.seeker_id, 'system', 'Payment received for a closed booking',
                        'We are refunding it in full.', '/bookings/' || v_b.id::text);
  return jsonb_build_object('booking_id', v_b.id, 'outcome', 'refund_needed');
end
$$;
revoke all on function public.confirm_booking_payment(text, text, bigint) from public, anon, authenticated;
grant execute on function public.confirm_booking_payment(text, text, bigint) to service_role;

-- Records the outcome of a provider refund for an order. service_role only.
create function public.mark_payment_refund(p_order_id text, p_status text, p_refund_id text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('pending', 'refunded', 'refund_due') then
    raise exception using errcode = 'ZV422', message = 'Unknown refund status.';
  end if;
  update public.payments
     set refund_status = p_status,
         provider_refund_id = coalesce(p_refund_id, provider_refund_id),
         status = case when p_status = 'refunded' then 'refunded'::public.payment_status else status end
   where provider = 'razorpay' and provider_order_id = p_order_id and status in ('paid', 'refunded')
     and refund_status <> 'refunded';
end
$$;
revoke all on function public.mark_payment_refund(text, text, text) from public, anon, authenticated;
grant execute on function public.mark_payment_refund(text, text, text) to service_role;

-- ───────────────────────────── expiry job: callable by the server ─────────────────────────────
-- pg_cron is not always installed; a Vercel cron calls this with the service role instead.
grant execute on function public.expire_stale_bookings() to service_role;
