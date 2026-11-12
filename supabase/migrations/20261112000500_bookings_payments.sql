-- ZUVIO stage 5 / 00 — bookings and payments (spec section 14.2).
--
-- Flow: the seeker requests a bed (per_bed) or the unit (entire_unit) -> the owner accepts or
-- declines before a deadline -> the seeker pays the booking amount online (Razorpay) -> the
-- payment is verified by the trusted server path -> the booking is confirmed and the bed reserved.
--
-- The amount is ALWAYS computed here from the listing, never taken from the client. Clients have
-- no write grant on either table; everything goes through the functions below. Payment
-- confirmation is callable only by service_role, which the server uses only after verifying the
-- provider's signature (src/features/bookings, payment webhook/verify routes).

create type public.booking_status as enum (
  'requested',        -- waiting for the owner
  'accepted',         -- owner accepted; waiting for the seeker's payment
  'confirmed',        -- paid (or confirmed without online payment by the owner, see below)
  'declined',         -- owner declined
  'expired',          -- owner did not answer in time, or payment window passed
  'cancelled'         -- seeker or owner cancelled
);
create type public.booking_amount_kind as enum ('security_deposit', 'first_month_rent');
create type public.payment_status as enum ('created', 'paid', 'failed', 'refunded');

create table public.bookings (
  id                   uuid primary key default gen_random_uuid(),
  property_id          uuid not null references public.properties (id) on delete restrict,
  seeker_id            uuid not null references public.users (id) on delete cascade,
  owner_id             uuid not null references public.property_owners (user_id) on delete cascade,
  room_id              uuid references public.rooms (id) on delete set null,
  bed_id               uuid references public.beds (id) on delete set null,
  move_in_date         date not null,
  stay_months          smallint not null,
  note                 text,
  status               public.booking_status not null default 'requested',
  amount_inr           integer not null,
  amount_kind          public.booking_amount_kind not null,
  monthly_rent_inr     integer not null,
  respond_by           timestamptz not null,
  pay_by               timestamptz,
  decided_at           timestamptz,
  decline_reason       text,
  confirmed_at         timestamptz,
  cancelled_at         timestamptz,
  cancelled_by         uuid references public.users (id) on delete set null,
  cancel_reason        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint bookings_stay_range check (stay_months between 1 and 36),
  constraint bookings_amount_positive check (amount_inr > 0 and monthly_rent_inr > 0),
  constraint bookings_note_length check (note is null or char_length(note) <= 500),
  constraint bookings_reason_length check (
    (decline_reason is null or char_length(decline_reason) <= 300) and (cancel_reason is null or char_length(cancel_reason) <= 300)
  )
);
create index bookings_seeker_idx on public.bookings (seeker_id, created_at desc);
create index bookings_owner_idx on public.bookings (owner_id, status, created_at desc);
create index bookings_property_idx on public.bookings (property_id);
create index bookings_room_idx on public.bookings (room_id) where room_id is not null;
-- A bed can have only one live booking at a time.
create unique index bookings_one_live_per_bed on public.bookings (bed_id)
  where bed_id is not null and status in ('requested', 'accepted', 'confirmed');
-- A seeker cannot stack live requests for the same listing.
create unique index bookings_one_live_per_seeker_property on public.bookings (seeker_id, property_id)
  where status in ('requested', 'accepted');
create trigger bookings_set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references public.bookings (id) on delete cascade,
  provider            text not null default 'razorpay',
  provider_order_id   text not null,
  provider_payment_id text,
  amount_paise        bigint not null,
  currency            text not null default 'INR',
  status              public.payment_status not null default 'created',
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint payments_order_unique unique (provider, provider_order_id),
  constraint payments_payment_unique unique (provider, provider_payment_id),
  constraint payments_amount_positive check (amount_paise > 0),
  constraint payments_provider check (provider in ('razorpay'))
);
create index payments_booking_idx on public.payments (booking_id);
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.bookings enable row level security;
alter table public.payments enable row level security;

grant select on public.bookings to authenticated;
create policy bookings_select_parties_or_staff on public.bookings
  for select to authenticated
  using (seeker_id = (select auth.uid()) or owner_id = (select auth.uid()) or (select public.is_staff()));

grant select on public.payments to authenticated;
create policy payments_select_parties_or_staff on public.payments
  for select to authenticated
  using (exists (select 1 from public.bookings b
                  where b.id = payments.booking_id
                    and (b.seeker_id = (select auth.uid()) or b.owner_id = (select auth.uid()) or (select public.is_staff()))));

-- ───────────────────────────── request_booking ─────────────────────────────
create function public.request_booking(
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
as $$
declare
  v_uid     uuid := auth.uid();
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
  if p_move_in_date is null or p_move_in_date < current_date or p_move_in_date > current_date + 180 then
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
    if exists (select 1 from public.bookings b where b.property_id = p_property_id and b.status = 'confirmed') then
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
revoke all on function public.request_booking(uuid, date, smallint, uuid, text) from public, anon;
grant execute on function public.request_booking(uuid, date, smallint, uuid, text) to authenticated;

-- ───────────────────────────── owner_respond_booking ─────────────────────────────
create function public.owner_respond_booking(p_booking_id uuid, p_accept boolean, p_reason text default null)
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
  select * into v_b from public.bookings where id = p_booking_id and owner_id = auth.uid() for update;
  if not found then
    raise exception using errcode = 'ZV404', message = 'Booking not found.';
  end if;
  if v_b.status <> 'requested' then
    raise exception using errcode = 'ZV409', message = 'This request has already been answered.';
  end if;
  if v_b.respond_by < now() then
    update public.bookings set status = 'expired' where id = v_b.id;
    raise exception using errcode = 'ZV409', message = 'This request expired before it was answered.';
  end if;
  if not p_accept and (p_reason is null or char_length(btrim(p_reason)) < 3) then
    raise exception using errcode = 'ZV422', message = 'Tell the seeker why (a few words is enough).';
  end if;

  update public.bookings
     set status = case when p_accept then 'accepted'::public.booking_status else 'declined'::public.booking_status end,
         decided_at = now(),
         pay_by = case when p_accept then now() + interval '48 hours' end,
         decline_reason = case when p_accept then null else btrim(p_reason) end
   where id = v_b.id;

  perform public.notify(v_b.seeker_id, 'system',
    case when p_accept then 'Booking accepted: complete payment' else 'Booking declined' end,
    case when p_accept then 'Pay within 48 hours to confirm.' else btrim(p_reason) end,
    '/bookings/' || v_b.id::text);
end
$$;
revoke all on function public.owner_respond_booking(uuid, boolean, text) from public, anon;
grant execute on function public.owner_respond_booking(uuid, boolean, text) to authenticated;

-- ───────────────────────────── cancel_booking ─────────────────────────────
-- Seeker: requested|accepted -> cancelled. Owner: requested|accepted -> cancelled. Confirmed
-- (paid) bookings are cancelled through support so the refund is handled; not here.
create function public.cancel_booking(p_booking_id uuid, p_reason text default null)
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
  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = nullif(btrim(p_reason), '')
   where id = v_b.id;
  perform public.notify(case when auth.uid() = v_b.seeker_id then v_b.owner_id else v_b.seeker_id end,
                        'system', 'Booking cancelled', nullif(btrim(p_reason), ''),
                        case when auth.uid() = v_b.seeker_id then '/owner/bookings' else '/bookings/' || v_b.id::text end);
end
$$;
revoke all on function public.cancel_booking(uuid, text) from public, anon;
grant execute on function public.cancel_booking(uuid, text) to authenticated;

-- ───────────────────────────── payments (trusted server path) ─────────────────────────────
-- Called by the seeker's request through the server BEFORE creating a provider order: checks
-- the booking is theirs and payable and returns the amount the order must be for.
create function public.booking_payable_amount(p_booking_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking_id and seeker_id = auth.uid();
  if not found then
    raise exception using errcode = 'ZV404', message = 'Booking not found.';
  end if;
  if v_b.status <> 'accepted' then
    raise exception using errcode = 'ZV409', message = 'This booking is not waiting for payment.';
  end if;
  if v_b.pay_by is not null and v_b.pay_by < now() then
    raise exception using errcode = 'ZV409', message = 'The payment window for this booking has passed.';
  end if;
  return v_b.amount_inr::bigint * 100;
end
$$;
revoke all on function public.booking_payable_amount(uuid) from public, anon;
grant execute on function public.booking_payable_amount(uuid) to authenticated;

-- Records the provider order the server created. service_role only.
create function public.record_payment_order(p_booking_id uuid, p_order_id text, p_amount_paise bigint)
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
  on conflict (provider, provider_order_id) do nothing;
end
$$;
revoke all on function public.record_payment_order(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.record_payment_order(uuid, text, bigint) to service_role;

-- Marks the payment paid and confirms the booking (idempotent). service_role only, called after
-- the server verified the provider signature. Reserves the bed.
create function public.confirm_booking_payment(p_order_id text, p_payment_id text, p_amount_paise bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
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
  if v_p.status = 'paid' then
    return v_b.id; -- already processed (webhook and browser both report the same payment)
  end if;

  update public.payments set status = 'paid', provider_payment_id = p_payment_id, paid_at = now() where id = v_p.id;
  if v_b.status = 'accepted' then
    update public.bookings set status = 'confirmed', confirmed_at = now() where id = v_b.id;
    if v_b.bed_id is not null then
      update public.beds set status = 'reserved', available_from = null where id = v_b.bed_id;
    end if;
    perform public.notify(v_b.owner_id, 'system', 'Booking confirmed and paid', null, '/owner/bookings');
    perform public.notify(v_b.seeker_id, 'system', 'Your booking is confirmed', null, '/bookings/' || v_b.id::text);
  end if;
  -- A payment that arrives after the booking was cancelled/expired stays recorded as paid for a refund.
  return v_b.id;
end
$$;
revoke all on function public.confirm_booking_payment(text, text, bigint) from public, anon, authenticated;
grant execute on function public.confirm_booking_payment(text, text, bigint) to service_role;

create function public.fail_payment(p_order_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payments set status = 'failed' where provider = 'razorpay' and provider_order_id = p_order_id and status = 'created';
$$;
revoke all on function public.fail_payment(text) from public, anon, authenticated;
grant execute on function public.fail_payment(text) to service_role;

-- ───────────────────────────── expiry job ─────────────────────────────
create function public.expire_stale_bookings()
returns integer
language sql
security definer
set search_path = ''
as $$
  with expired as (
    update public.bookings set status = 'expired'
     where (status = 'requested' and respond_by < now())
        or (status = 'accepted' and pay_by < now())
    returning 1
  )
  select count(*)::integer from expired;
$$;
revoke all on function public.expire_stale_bookings() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('zuvio-expire-bookings', '*/15 * * * *', 'select public.expire_stale_bookings()');
  end if;
end
$$;
