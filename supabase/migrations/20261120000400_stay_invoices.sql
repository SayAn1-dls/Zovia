-- Stay booking receipts: a numbered document for every confirmed stay booking.
--
-- The number is issued here, once, the first time a booking becomes confirmed (pay at the property:
-- at booking; online: when the payment is captured). It never changes; the document itself always
-- shows the booking's current state (confirmed, cancelled, refunded), read live from the booking.
-- Numbers look like ZV-202611-000042 (India year and month of issue, then a running number; gaps
-- are possible when a transaction rolls back, which is fine for a receipt).

create sequence public.stay_invoice_seq;

create table public.stay_invoices (
  booking_id  uuid primary key references public.stay_bookings (id) on delete cascade,
  invoice_no  text not null unique,
  issued_at   timestamptz not null default now(),
  constraint stay_invoices_no_shape check (invoice_no ~ '^ZV-[0-9]{6}-[0-9]{6,}$')
);
comment on table public.stay_invoices is 'Receipt number of a stay booking, issued once when it is first confirmed. Read through get_stay_invoice().';

alter table public.stay_invoices enable row level security;
grant select on public.stay_invoices to authenticated;
create policy stay_invoices_select_own_or_staff on public.stay_invoices
  for select to authenticated
  using (exists (select 1 from public.stay_bookings b
                  where b.id = stay_invoices.booking_id
                    and (b.user_id = (select auth.uid()) or (select public.is_staff()))));

create function public.stay_issue_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'confirmed' then
    insert into public.stay_invoices (booking_id, invoice_no)
    values (new.id,
            'ZV-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYYMM') || '-'
                  || lpad(nextval('public.stay_invoice_seq')::text, 6, '0'))
    on conflict (booking_id) do nothing;
  end if;
  return null;
end
$$;
comment on function public.stay_issue_invoice() is 'AFTER INSERT/UPDATE OF status on stay_bookings: issues the receipt number the first time a booking is confirmed.';

create trigger stay_bookings_issue_invoice after insert or update of status on public.stay_bookings
  for each row execute function public.stay_issue_invoice();

-- Backfill: bookings confirmed before this migration.
insert into public.stay_invoices (booking_id, invoice_no, issued_at)
select b.id,
       'ZV-' || to_char(b.created_at at time zone 'Asia/Kolkata', 'YYYYMM') || '-' || lpad(nextval('public.stay_invoice_seq')::text, 6, '0'),
       b.created_at
  from public.stay_bookings b
 where b.status in ('confirmed', 'completed') or (b.status = 'cancelled' and (b.paid or b.payment_mode = 'at_property'))
 order by b.created_at
on conflict (booking_id) do nothing;

-- { invoice_no, issued_at, booking: StayBookingRow } for the caller's own booking; null when the
-- booking is not theirs or has no receipt (never confirmed).
create function public.get_stay_invoice(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('invoice_no', i.invoice_no, 'issued_at', i.issued_at, 'booking', public.stay_booking_json(b))
    from public.stay_bookings b
    join public.stay_invoices i on i.booking_id = b.id
   where b.id = p_booking_id and b.user_id = auth.uid()
$$;
revoke all on function public.get_stay_invoice(uuid) from public;
grant execute on function public.get_stay_invoice(uuid) to authenticated;

-- The same for the server's e-mail path (after a verified payment there is no user session).
create function public.service_get_stay_invoice(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('invoice_no', i.invoice_no, 'issued_at', i.issued_at, 'booking', public.stay_booking_json(b))
    from public.stay_bookings b
    join public.stay_invoices i on i.booking_id = b.id
   where b.id = p_booking_id
$$;
revoke all on function public.service_get_stay_invoice(uuid) from public;
grant execute on function public.service_get_stay_invoice(uuid) to service_role;
