-- Stay bookings (Zostel-style): dates, room types with a quantity, price with tax, instant booking,
-- cancellation by policy. Design: docs/stay-booking.md. Contract: src/features/stays/{schemas,ports}.ts.
--
-- Inventory comes from the catalogue (scripts/sync-stay-inventory.sql, generated from
-- src/features/catalog). The database is the authority for capacity and price: book_stay() locks
-- the listing's inventory rows, recomputes per-night availability and prices, and inserts only
-- when every night has room. Clients have no write grant on any table here; everything goes
-- through the functions below. Rules mirror STAY_RULES in schemas.ts: change both together.
--
-- A unit is one bed of a room type. A booking occupies the nights check_in .. check_out - 1, so the
-- check-out day is free for the next check-in. Units count against capacity while the booking is
-- `confirmed`, or `pending_payment` with a live hold. Dates are India dates, never current_date (UTC).

-- ───────────────────────────── tables ─────────────────────────────
create table public.stay_inventory (
  listing_ref       text not null,
  room_type         text not null,
  units             integer not null,
  rent_per_month    integer not null,
  ac                boolean not null default false,
  attached_bathroom boolean not null default false,
  active            boolean not null default true,
  updated_at        timestamptz not null default now(),
  primary key (listing_ref, room_type),
  constraint stay_inventory_room_type check (room_type in ('single', 'double', 'triple')),
  constraint stay_inventory_units check (units between 0 and 500),
  constraint stay_inventory_rent check (rent_per_month > 0),
  constraint stay_inventory_ref check (char_length(listing_ref) between 1 and 200)
);
create trigger stay_inventory_set_updated_at before update on public.stay_inventory
  for each row execute function public.set_updated_at();

-- Single-row switch the server flips once online payment is live, so nobody can skip paying by
-- calling book_stay() directly with 'at_property'.
create table public.stay_settings (
  id                   boolean primary key default true,
  online_payment_only  boolean not null default false,
  updated_at           timestamptz not null default now(),
  constraint stay_settings_single_row check (id)
);
insert into public.stay_settings (id) values (true);

comment on table public.stay_inventory is 'Bookable beds per catalogue listing and room type (units, monthly rent), synced from the catalogue by scripts/sync-stay-inventory.ts. Read through stay_availability().';
comment on table public.stay_settings is 'Single row: online_payment_only switches off pay-at-property bookings once online payment is live.';
create policy stay_settings_select_staff on public.stay_settings
  for select to authenticated using ((select public.is_staff()));
grant select on public.stay_settings to authenticated;

create table public.stay_bookings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users (id) on delete cascade,
  listing_ref         text not null,
  check_in            date not null,
  check_out           date not null,
  nights              integer not null,
  guests              integer not null,
  status              text not null,
  payment_mode        text not null,
  paid                boolean not null default false,
  paid_at             timestamptz,
  amount_stay_inr     integer not null,
  tax_percent         integer not null,
  amount_tax_inr      integer not null,
  amount_total_inr    integer not null,
  guest_name          text not null,
  guest_phone         text not null,
  guest_email         text not null,
  special_requests    text,
  hold_expires_at     timestamptz,
  cancelled_at        timestamptz,
  cancel_reason       text,
  refund_inr          integer not null default 0,
  refund_status       text not null default 'none',
  provider_order_id   text unique,
  provider_payment_id text unique,
  provider_refund_id  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint stay_bookings_status check (status in ('pending_payment', 'confirmed', 'cancelled', 'expired', 'completed')),
  constraint stay_bookings_payment_mode check (payment_mode in ('online', 'at_property')),
  constraint stay_bookings_refund_status check (refund_status in ('none', 'pending', 'refunded', 'refund_due')),
  constraint stay_bookings_range check (check_out > check_in and nights = check_out - check_in and nights between 1 and 30),
  constraint stay_bookings_guests check (guests between 1 and 8),
  constraint stay_bookings_amounts check (
    amount_stay_inr > 0 and amount_tax_inr >= 0 and amount_total_inr = amount_stay_inr + amount_tax_inr
    and refund_inr between 0 and amount_total_inr
  ),
  constraint stay_bookings_hold check (status <> 'pending_payment' or hold_expires_at is not null),
  constraint stay_bookings_text_lengths check (
    char_length(guest_name) between 2 and 80 and char_length(guest_phone) = 10 and char_length(guest_email) <= 254
    and (special_requests is null or char_length(special_requests) <= 500)
    and (cancel_reason is null or char_length(cancel_reason) <= 300)
  )
);
create index stay_bookings_user_idx on public.stay_bookings (user_id, created_at desc);
create index stay_bookings_live_idx on public.stay_bookings (listing_ref, check_in, check_out)
  where status in ('pending_payment', 'confirmed');
create index stay_bookings_hold_idx on public.stay_bookings (hold_expires_at) where status = 'pending_payment';
create trigger stay_bookings_set_updated_at before update on public.stay_bookings
  for each row execute function public.set_updated_at();

comment on table public.stay_bookings is 'Stay bookings (dates, guests, price with tax, payment, cancellation and refund). Written only by book_stay(), cancel_stay(), mark_stay_paid(), mark_stay_refund() and expire_stay_holds().';

create table public.stay_booking_items (
  booking_id     uuid not null references public.stay_bookings (id) on delete cascade,
  room_type      text not null,
  units          integer not null,
  unit_price_inr integer not null,
  primary key (booking_id, room_type),
  constraint stay_booking_items_room_type check (room_type in ('single', 'double', 'triple')),
  constraint stay_booking_items_units check (units between 1 and 8),
  constraint stay_booking_items_price check (unit_price_inr > 0)
);

comment on table public.stay_booking_items is 'Room types and quantities of a stay booking, with the nightly unit price fixed at booking time.';

-- ───────────────────────────── RLS and grants ─────────────────────────────
alter table public.stay_inventory enable row level security;
alter table public.stay_settings enable row level security;
alter table public.stay_bookings enable row level security;
alter table public.stay_booking_items enable row level security;

-- Inventory and settings: read through stay_availability() only; staff may look at the raw rows.
grant select on public.stay_inventory to authenticated;
create policy stay_inventory_select_staff on public.stay_inventory
  for select to authenticated using ((select public.is_staff()));

-- Bookings: the guest sees their own, staff see all. No client writes.
grant select on public.stay_bookings to authenticated;
create policy stay_bookings_select_own_or_staff on public.stay_bookings
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

grant select on public.stay_booking_items to authenticated;
create policy stay_booking_items_select_own_or_staff on public.stay_booking_items
  for select to authenticated
  using (exists (select 1 from public.stay_bookings b
                  where b.id = stay_booking_items.booking_id
                    and (b.user_id = (select auth.uid()) or (select public.is_staff()))));

-- ───────────────────────────── helpers (internal: no grants) ─────────────────────────────
create function public.stay_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;
grant execute on function public.stay_today() to anon, authenticated, service_role;

-- Nightly price per unit = ceil(rent per month / 30).
create function public.stay_unit_price(p_rent integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select ceil(p_rent::numeric / 30)::integer
$$;

-- One tax rate per booking, chosen by the highest nightly unit price.
create function public.stay_tax_percent(p_max_unit_price integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_max_unit_price <= 7500 then 5 else 18 end
$$;

-- Tax in whole rupees, rounded half up, once on the stay total.
create function public.stay_tax(p_stay_total integer, p_percent integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select round(p_stay_total::numeric * p_percent / 100)::integer
$$;

create function public.stay_room_label(p_room_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_room_type when 'single' then 'Single room' when 'double' then 'Double sharing'
                          when 'triple' then 'Triple sharing' else p_room_type end
$$;

-- Check-in is 13:00 India time; a full refund needs at least 7 days' notice.
create function public.stay_free_cancel_deadline(p_check_in date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select ((p_check_in - 7) + time '13:00') at time zone 'Asia/Kolkata'
$$;

create function public.stay_check_in_at(p_check_in date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (p_check_in + time '13:00') at time zone 'Asia/Kolkata'
$$;

-- Free units of one room type for each night in [p_from, p_to). p_exclude leaves one booking out
-- (used when re-checking a booking that is being paid after its hold ran out).
create function public.stay_nights_free(p_listing text, p_room_type text, p_from date, p_to date, p_exclude uuid default null)
returns table (night date, units_left integer)
language sql
stable
security definer
set search_path = ''
as $$
  select n.night::date,
         greatest(0, coalesce(i.units, 0) - coalesce((
           select sum(it.units)
             from public.stay_booking_items it
             join public.stay_bookings b on b.id = it.booking_id
            where b.listing_ref = p_listing
              and it.room_type = p_room_type
              and b.check_in <= n.night::date and b.check_out > n.night::date
              and (b.status = 'confirmed' or (b.status = 'pending_payment' and b.hold_expires_at > now()))
              and b.id is distinct from p_exclude
         ), 0))::integer
    from generate_series(p_from, p_to - 1, interval '1 day') as n(night)
    left join public.stay_inventory i
      on i.listing_ref = p_listing and i.room_type = p_room_type and i.active
   order by 1
$$;

create function public.stay_units_left(p_listing text, p_room_type text, p_from date, p_to date, p_exclude uuid default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(min(f.units_left), 0)::integer from public.stay_nights_free(p_listing, p_room_type, p_from, p_to, p_exclude) f
$$;

-- A booking in the StayBookingRow shape (src/features/stays/ports.ts).
create function public.stay_booking_json(p_b public.stay_bookings)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_b.id,
    'status', p_b.status,
    'payment_mode', p_b.payment_mode,
    'paid', p_b.paid,
    'listing', p_b.listing_ref,
    'checkin', p_b.check_in,
    'checkout', p_b.check_out,
    'nights', p_b.nights,
    'guests', p_b.guests,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'room_type', it.room_type,
               'label', public.stay_room_label(it.room_type),
               'units', it.units,
               'unit_price_inr', it.unit_price_inr,
               'nights', p_b.nights,
               'line_total_inr', it.units * it.unit_price_inr * p_b.nights)
             order by array_position(array['single', 'double', 'triple'], it.room_type))
        from public.stay_booking_items it where it.booking_id = p_b.id), '[]'::jsonb),
    'stay_total_inr', p_b.amount_stay_inr,
    'tax_percent', p_b.tax_percent,
    'tax_inr', p_b.amount_tax_inr,
    'grand_total_inr', p_b.amount_total_inr,
    'guest_name', p_b.guest_name,
    'guest_phone', p_b.guest_phone,
    'guest_email', p_b.guest_email,
    'special_requests', p_b.special_requests,
    'hold_expires_at', case when p_b.status = 'pending_payment' then p_b.hold_expires_at end,
    'cancelled_at', p_b.cancelled_at,
    'cancel_reason', p_b.cancel_reason,
    'refund_inr', p_b.refund_inr,
    'refund_status', p_b.refund_status,
    'free_cancel_until', case
      when p_b.status in ('pending_payment', 'confirmed') and now() < public.stay_free_cancel_deadline(p_b.check_in)
      then public.stay_free_cancel_deadline(p_b.check_in) end,
    'created_at', p_b.created_at
  )
$$;

-- ───────────────────────────── stay_availability (public) ─────────────────────────────
-- Per active room type: capacity, rent, fewest free units over the range, and a 7-night strip
-- from check-in. Unknown listing: empty array.
create function public.stay_availability(p_listing text, p_checkin date, p_checkout date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := public.stay_today();
begin
  if p_checkin is null or p_checkout is null or p_checkout <= p_checkin or p_checkout - p_checkin > 30 then
    raise exception using errcode = 'ZV422', message = 'Choose a check-out 1 to 30 nights after check-in.';
  end if;
  if p_checkin < v_today or p_checkin > v_today + 365 then
    raise exception using errcode = 'ZV422', message = 'Choose a check-in from today up to a year ahead.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'room_type', i.room_type,
             'units_total', i.units,
             'rent_per_month_inr', i.rent_per_month,
             'units_left', public.stay_units_left(i.listing_ref, i.room_type, p_checkin, p_checkout),
             'ac', i.ac,
             'attached_bathroom', i.attached_bathroom,
             'strip', (select jsonb_agg(jsonb_build_object('date', f.night, 'units_left', f.units_left) order by f.night)
                         from public.stay_nights_free(i.listing_ref, i.room_type, p_checkin, p_checkin + 7) f))
           order by array_position(array['single', 'double', 'triple'], i.room_type))
      from public.stay_inventory i
     where i.listing_ref = p_listing and i.active
  ), '[]'::jsonb);
end
$$;
revoke all on function public.stay_availability(text, date, date) from public;
grant execute on function public.stay_availability(text, date, date) to anon, authenticated, service_role;

-- ───────────────────────────── book_stay ─────────────────────────────
-- p_rooms: [{ "room_type": "double", "qty": 2 }, ...]. Prices come from stay_inventory only.
-- 'online' holds the beds as pending_payment for 15 minutes; 'at_property' confirms at once
-- (refused once stay_settings.online_payment_only is on).
create function public.book_stay(
  p_listing          text,
  p_checkin          date,
  p_checkout         date,
  p_rooms            jsonb,
  p_guest_name       text,
  p_guest_phone      text,
  p_guest_email      text,
  p_special_requests text default null,
  p_payment_mode     text default 'online'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '3s'
set statement_timeout = '10s'
as $$
declare
  v_uid      uuid := auth.uid();
  v_today    date := public.stay_today();
  v_nights   integer;
  v_room     jsonb;
  v_type     text;
  v_qty      integer;
  v_inv      public.stay_inventory;
  v_left     integer;
  v_guests   integer := 0;
  v_stay     integer := 0;
  v_max_unit integer := 0;
  v_unit     integer;
  v_pct      integer;
  v_tax      integer;
  v_short    text[] := '{}';
  v_seen     text[] := '{}';
  v_b        public.stay_bookings;
begin
  if v_uid is null then
    raise exception using errcode = 'ZV401', message = 'Please sign in to book.';
  end if;
  if not public.is_active_user() then
    raise exception using errcode = 'ZV423', message = 'Your account cannot make bookings right now.';
  end if;

  -- dates
  if p_checkin is null or p_checkout is null or p_checkout <= p_checkin then
    raise exception using errcode = 'ZV422', message = 'Check-out must be after check-in.';
  end if;
  v_nights := p_checkout - p_checkin;
  if v_nights > 30 then
    raise exception using errcode = 'ZV422', message = 'At most 30 nights in one booking.';
  end if;
  if p_checkin < v_today or p_checkin > v_today + 365 then
    raise exception using errcode = 'ZV422', message = 'Choose a check-in from today up to a year ahead.';
  end if;

  -- guest
  if p_guest_name is null or char_length(btrim(p_guest_name)) not between 2 and 80 then
    raise exception using errcode = 'ZV422', message = 'Enter your name.';
  end if;
  if p_guest_phone is null or btrim(p_guest_phone) !~ '^[6-9][0-9]{9}$' then
    raise exception using errcode = 'ZV422', message = 'Enter a 10-digit mobile number.';
  end if;
  if p_guest_email is null or char_length(btrim(p_guest_email)) > 254
     or lower(btrim(p_guest_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode = 'ZV422', message = 'Enter a valid e-mail.';
  end if;
  if p_special_requests is not null and char_length(btrim(p_special_requests)) > 500 then
    raise exception using errcode = 'ZV422', message = 'Keep special requests under 500 characters.';
  end if;
  if p_payment_mode is null or p_payment_mode not in ('online', 'at_property') then
    raise exception using errcode = 'ZV422', message = 'Choose how to pay.';
  end if;
  if p_payment_mode = 'at_property' and (select s.online_payment_only from public.stay_settings s where s.id) then
    raise exception using errcode = 'ZV422', message = 'This booking must be paid online.';
  end if;

  -- rooms (shape only; capacity is checked under the lock below)
  if p_rooms is null or jsonb_typeof(p_rooms) <> 'array' or jsonb_array_length(p_rooms) not between 1 and 3 then
    raise exception using errcode = 'ZV422', message = 'Choose a bed.';
  end if;
  for v_room in select value from jsonb_array_elements(p_rooms) loop
    v_type := v_room ->> 'room_type';
    if v_type is null or v_type not in ('single', 'double', 'triple') or v_type = any (v_seen) then
      raise exception using errcode = 'ZV422', message = 'Choose each room type once.';
    end if;
    if coalesce(jsonb_typeof(v_room -> 'qty'), '') <> 'number' or coalesce(v_room ->> 'qty', '') !~ '^[0-9]{1,2}$' then
      raise exception using errcode = 'ZV422', message = 'Choose how many beds.';
    end if;
    v_qty := (v_room ->> 'qty')::integer;
    if v_qty < 1 then
      raise exception using errcode = 'ZV422', message = 'Choose at least 1 bed.';
    end if;
    v_seen := v_seen || v_type;
    v_guests := v_guests + v_qty;
  end loop;
  if v_guests > 8 then
    raise exception using errcode = 'ZV422', message = 'At most 8 beds in one booking.';
  end if;

  if not exists (select 1 from public.stay_inventory i where i.listing_ref = p_listing and i.active) then
    raise exception using errcode = 'ZV404', message = 'This place cannot be booked online.';
  end if;
  if not public.consume_rate_limit('stay_booking', 20, 86400) then
    raise exception using errcode = 'ZV429', message = 'You have made many bookings today. Please try again tomorrow.';
  end if;
  if p_payment_mode = 'online' and (select count(*) from public.stay_bookings b
       where b.user_id = v_uid and b.status = 'pending_payment' and b.hold_expires_at > now()) >= 3 then
    raise exception using errcode = 'ZV409', message = 'Finish paying for your open bookings first, or wait 15 minutes.';
  end if;

  -- Serialise bookings of this listing: lock its inventory rows in a fixed order.
  perform 1 from public.stay_inventory i where i.listing_ref = p_listing order by i.room_type for update;

  for v_room in select value from jsonb_array_elements(p_rooms) loop
    v_type := v_room ->> 'room_type';
    v_qty := (v_room ->> 'qty')::integer;
    select * into v_inv from public.stay_inventory i where i.listing_ref = p_listing and i.room_type = v_type and i.active;
    if not found then
      v_short := v_short || public.stay_room_label(v_type);
      continue;
    end if;
    v_left := public.stay_units_left(p_listing, v_type, p_checkin, p_checkout);
    if v_left < v_qty then
      v_short := v_short || public.stay_room_label(v_type);
      continue;
    end if;
    v_unit := public.stay_unit_price(v_inv.rent_per_month);
    v_max_unit := greatest(v_max_unit, v_unit);
    v_stay := v_stay + v_unit * v_qty * v_nights;
  end loop;
  if array_length(v_short, 1) > 0 then
    raise exception using errcode = 'ZV409',
      message = 'Sold out for these dates: ' || array_to_string(v_short, ', ') || '. Try other dates or fewer beds.';
  end if;

  v_pct := public.stay_tax_percent(v_max_unit);
  v_tax := public.stay_tax(v_stay, v_pct);

  insert into public.stay_bookings (user_id, listing_ref, check_in, check_out, nights, guests, status, payment_mode,
                                    amount_stay_inr, tax_percent, amount_tax_inr, amount_total_inr,
                                    guest_name, guest_phone, guest_email, special_requests, hold_expires_at)
  values (v_uid, p_listing, p_checkin, p_checkout, v_nights, v_guests,
          case when p_payment_mode = 'online' then 'pending_payment' else 'confirmed' end, p_payment_mode,
          v_stay, v_pct, v_tax, v_stay + v_tax,
          btrim(p_guest_name), btrim(p_guest_phone), lower(btrim(p_guest_email)), nullif(btrim(p_special_requests), ''),
          case when p_payment_mode = 'online' then now() + interval '15 minutes' end)
  returning * into v_b;

  insert into public.stay_booking_items (booking_id, room_type, units, unit_price_inr)
  select v_b.id, r ->> 'room_type', (r ->> 'qty')::integer, public.stay_unit_price(i.rent_per_month)
    from jsonb_array_elements(p_rooms) r
    join public.stay_inventory i on i.listing_ref = p_listing and i.room_type = r ->> 'room_type';

  if v_b.status = 'confirmed' then
    perform public.notify(v_uid, 'system', 'Your stay is booked', null, '/bookings/' || v_b.id::text);
  end if;
  return public.stay_booking_json(v_b);
end
$$;
revoke all on function public.book_stay(text, date, date, jsonb, text, text, text, text, text) from public;
grant execute on function public.book_stay(text, date, date, jsonb, text, text, text, text, text) to authenticated;

-- ───────────────────────────── cancel_stay ─────────────────────────────
-- Guest cancels until check-in (13:00 India time). Paid online and at least 7 days ahead: 100%
-- refund, recorded as refund_due until the server issues it through the provider. Otherwise 0%.
-- Returns { booking, refund_percent }.
create function public.cancel_stay(p_booking_id uuid, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_b   public.stay_bookings;
  v_pct integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = 'ZV401', message = 'Please sign in.';
  end if;
  if p_reason is not null and char_length(btrim(p_reason)) > 300 then
    raise exception using errcode = 'ZV422', message = 'Keep the reason under 300 characters.';
  end if;
  select * into v_b from public.stay_bookings where id = p_booking_id and user_id = auth.uid() for update;
  if not found then
    raise exception using errcode = 'ZV404', message = 'Booking not found.';
  end if;
  if v_b.status not in ('pending_payment', 'confirmed') then
    raise exception using errcode = 'ZV409', message = 'This booking is already ' || replace(v_b.status, '_', ' ') || '.';
  end if;
  if now() >= public.stay_check_in_at(v_b.check_in) then
    raise exception using errcode = 'ZV409', message = 'This stay has already started, so it cannot be cancelled here.';
  end if;

  if v_b.paid and v_b.payment_mode = 'online' and now() < public.stay_free_cancel_deadline(v_b.check_in) then
    v_pct := 100;
  end if;

  update public.stay_bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = nullif(btrim(p_reason), ''),
         refund_inr = case when v_b.paid then (amount_total_inr * v_pct) / 100 else 0 end,
         refund_status = case when v_b.paid and v_pct > 0 then 'refund_due' else 'none' end
   where id = v_b.id
  returning * into v_b;

  return jsonb_build_object('booking', public.stay_booking_json(v_b), 'refund_percent', v_pct);
end
$$;
revoke all on function public.cancel_stay(uuid, text) from public;
grant execute on function public.cancel_stay(uuid, text) to authenticated;

-- ───────────────────────────── reads ─────────────────────────────
create function public.my_stay_bookings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.stay_booking_json(b) order by b.created_at desc), '[]'::jsonb)
    from (select * from public.stay_bookings where user_id = auth.uid() order by created_at desc limit 100) b
$$;
revoke all on function public.my_stay_bookings() from public;
grant execute on function public.my_stay_bookings() to authenticated;

create function public.get_stay_booking(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.stay_booking_json(b)
    from public.stay_bookings b
   where b.id = p_id and b.user_id = auth.uid()
$$;
revoke all on function public.get_stay_booking(uuid) from public;
grant execute on function public.get_stay_booking(uuid) to authenticated;

-- Staff view of any booking (support desk). Separate from get_stay_booking() so guest-facing code
-- never sees another person's booking, even when a staff member is signed in.
create function public.staff_get_stay_booking(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception using errcode = 'ZV403', message = 'Staff only.';
  end if;
  return (select public.stay_booking_json(b) || jsonb_build_object('user_id', b.user_id)
            from public.stay_bookings b where b.id = p_id);
end
$$;
revoke all on function public.staff_get_stay_booking(uuid) from public;
grant execute on function public.staff_get_stay_booking(uuid) to authenticated;

-- ───────────────────────────── payments (service_role only) ─────────────────────────────
-- The open order of a booking (re-used instead of creating a second one) and what it must charge.
create function public.stay_payment_state(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'booking_id', b.id,
           'status', b.status,
           'paid', b.paid,
           'payable', b.status = 'pending_payment' and not b.paid and b.hold_expires_at > now(),
           'order_id', b.provider_order_id,
           'amount_paise', b.amount_total_inr::bigint * 100,
           'user_id', b.user_id)
    from public.stay_bookings b where b.id = p_booking_id
$$;
revoke all on function public.stay_payment_state(uuid) from public;
grant execute on function public.stay_payment_state(uuid) to service_role;

-- Stores the provider order for a booking. If another request stored one first, returns that one
-- (the caller then uses it and abandons its own, unpaid order).
create function public.record_stay_order(p_booking_id uuid, p_order_id text, p_amount_paise bigint)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_b public.stay_bookings;
begin
  select * into v_b from public.stay_bookings where id = p_booking_id for update;
  if not found then
    raise exception using errcode = 'ZV404', message = 'Booking not found.';
  end if;
  if v_b.status <> 'pending_payment' or v_b.paid or v_b.hold_expires_at <= now() then
    raise exception using errcode = 'ZV409', message = 'This booking is not waiting for payment.';
  end if;
  if p_amount_paise <> v_b.amount_total_inr::bigint * 100 then
    raise exception using errcode = 'ZV422', message = 'Payment amount does not match the booking.';
  end if;
  if v_b.provider_order_id is not null then
    return v_b.provider_order_id;
  end if;
  update public.stay_bookings set provider_order_id = p_order_id where id = v_b.id;
  return p_order_id;
end
$$;
revoke all on function public.record_stay_order(uuid, text, bigint) from public;
grant execute on function public.record_stay_order(uuid, text, bigint) to service_role;

-- Records a captured payment (idempotent). Returns { booking_id, outcome }:
--   confirmed        the booking is confirmed (also when the hold had run out but the beds are still free)
--   already_paid     this payment was recorded before
--   refund_needed    money arrived for a booking that cannot be honoured (cancelled, or beds gone):
--                    the booking is marked refund_due; the server refunds through the provider
--   duplicate        a second payment for an already paid booking: not recorded; refund that payment
create function public.mark_stay_paid(p_order_id text, p_payment_id text, p_amount_paise bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '3s'
as $$
declare
  v_b     public.stay_bookings;
  v_ok    boolean := true;
  v_item  public.stay_booking_items;
begin
  select * into v_b from public.stay_bookings where provider_order_id = p_order_id;
  if not found then
    raise exception using errcode = 'ZV404', message = 'Unknown payment order.';
  end if;
  -- Same lock order as book_stay: inventory first, then the booking.
  perform 1 from public.stay_inventory i where i.listing_ref = v_b.listing_ref order by i.room_type for update;
  select * into v_b from public.stay_bookings where id = v_b.id for update;

  if p_amount_paise <> v_b.amount_total_inr::bigint * 100 then
    raise exception using errcode = 'ZV422', message = 'Paid amount does not match the booking.';
  end if;
  if v_b.paid then
    return jsonb_build_object('booking_id', v_b.id,
      'outcome', case when v_b.provider_payment_id = p_payment_id then 'already_paid' else 'duplicate' end);
  end if;

  if v_b.status in ('pending_payment', 'expired') then
    -- Paid after the hold ran out: still honour it when every night has room without this booking.
    if v_b.status = 'expired' or v_b.hold_expires_at <= now() then
      for v_item in select * from public.stay_booking_items where booking_id = v_b.id loop
        if public.stay_units_left(v_b.listing_ref, v_item.room_type, v_b.check_in, v_b.check_out, v_b.id) < v_item.units then
          v_ok := false;
        end if;
      end loop;
    end if;
  elsif v_b.status = 'confirmed' then
    v_ok := true;  -- confirmed without payment (at the property): the online payment settles it
  else
    v_ok := false; -- cancelled or completed
  end if;

  if v_ok then
    update public.stay_bookings
       set status = 'confirmed', paid = true, paid_at = now(), provider_payment_id = p_payment_id, hold_expires_at = null
     where id = v_b.id;
    perform public.notify(v_b.user_id, 'system', 'Your stay is booked and paid', null, '/bookings/' || v_b.id::text);
    return jsonb_build_object('booking_id', v_b.id, 'outcome', 'confirmed');
  end if;

  update public.stay_bookings
     set status = case when status = 'pending_payment' then 'expired' else status end,
         paid = true, paid_at = now(), provider_payment_id = p_payment_id,
         refund_inr = amount_total_inr, refund_status = 'refund_due'
   where id = v_b.id;
  perform public.notify(v_b.user_id, 'system', 'Payment received after your booking closed',
                        'We are refunding it in full.', '/bookings/' || v_b.id::text);
  return jsonb_build_object('booking_id', v_b.id, 'outcome', 'refund_needed');
end
$$;
revoke all on function public.mark_stay_paid(text, text, bigint) from public;
grant execute on function public.mark_stay_paid(text, text, bigint) to service_role;

-- Records the outcome of a provider refund: 'pending' or 'refunded'; 'refund_due' when it failed.
create function public.mark_stay_refund(p_booking_id uuid, p_status text, p_refund_id text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_status not in ('pending', 'refunded', 'refund_due') then
    raise exception using errcode = 'ZV422', message = 'Unknown refund status.';
  end if;
  update public.stay_bookings
     set refund_status = p_status, provider_refund_id = coalesce(p_refund_id, provider_refund_id)
   where id = p_booking_id and paid and refund_inr > 0 and refund_status <> 'refunded';
end
$$;
revoke all on function public.mark_stay_refund(uuid, text, text) from public;
grant execute on function public.mark_stay_refund(uuid, text, text) to service_role;

-- ───────────────────────────── expiry job (service_role) ─────────────────────────────
-- Availability already ignores holds past their time; this makes the status say so and closes
-- finished stays. Returns the number of rows changed. Run by pg_cron when present, and callable
-- by the server (a Vercel cron) with the service role.
create function public.expire_stay_holds()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with expired as (
    update public.stay_bookings set status = 'expired'
     where status = 'pending_payment' and hold_expires_at <= now()
    returning 1
  ), completed as (
    update public.stay_bookings set status = 'completed'
     where status = 'confirmed' and check_out <= public.stay_today()
    returning 1
  )
  select ((select count(*) from expired) + (select count(*) from completed))::integer
$$;
revoke all on function public.expire_stay_holds() from public;
grant execute on function public.expire_stay_holds() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('zovia-expire-stay-holds', '* * * * *', 'select public.expire_stay_holds()');
  end if;
end
$$;
