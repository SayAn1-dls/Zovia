-- Stay bookings: limits against bed hoarding, and a staff release.
--
-- While online payment is off, every booking is 'at_property': confirmed at once with no money,
-- so one account could hold a whole property for a month for free. The limits below run in a
-- trigger on every new booking (so book_stay() and any future write path obey them), next to the
-- 3-open-holds limit already inside book_stay():
--   - at most 2 upcoming pay-at-property bookings per guest, and 1 per listing;
--   - at most 3 bookings (any mode) per guest per listing in 24 hours (hold churn);
--   - at most 12 pay-at-property bookings per listing in 24 hours, all guests together
--     (bounds the damage of many throwaway accounts).
-- "Upcoming" = confirmed and not yet checked out. A per-guest advisory lock makes the per-guest
-- counts exact under parallel requests (book_stay already serialises per listing).

create function public.stay_bookings_abuse_caps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.stay_today();
begin
  perform pg_advisory_xact_lock(hashtextextended('stay_user:' || new.user_id::text, 0));

  if (select count(*) from public.stay_bookings b
       where b.user_id = new.user_id and b.listing_ref = new.listing_ref
         and b.created_at > now() - interval '24 hours') >= 3 then
    raise exception using errcode = 'ZV429',
      message = 'You have made several bookings for this place today. Please try again tomorrow.';
  end if;

  if new.payment_mode = 'at_property' then
    if (select count(*) from public.stay_bookings b
         where b.user_id = new.user_id and b.listing_ref = new.listing_ref
           and b.payment_mode = 'at_property' and b.status = 'confirmed' and b.check_out > v_today) >= 1 then
      raise exception using errcode = 'ZV409',
        message = 'You already have an upcoming pay-at-property booking here. Cancel it or wait until it ends to book again.';
    end if;
    if (select count(*) from public.stay_bookings b
         where b.user_id = new.user_id
           and b.payment_mode = 'at_property' and b.status = 'confirmed' and b.check_out > v_today) >= 2 then
      raise exception using errcode = 'ZV409',
        message = 'You can hold at most 2 upcoming pay-at-property bookings. Cancel one to book another.';
    end if;
    if (select count(*) from public.stay_bookings b
         where b.listing_ref = new.listing_ref and b.payment_mode = 'at_property'
           and b.created_at > now() - interval '24 hours') >= 12 then
      raise exception using errcode = 'ZV429',
        message = 'This place has taken many bookings today. Please try again tomorrow.';
    end if;
  end if;
  return new;
end
$$;
comment on function public.stay_bookings_abuse_caps() is 'BEFORE INSERT on stay_bookings: per-guest and per-listing limits against bed hoarding (see migration header).';

create trigger stay_bookings_abuse_caps before insert on public.stay_bookings
  for each row execute function public.stay_bookings_abuse_caps();

create index stay_bookings_user_listing_idx on public.stay_bookings (user_id, listing_ref, created_at desc);
create index stay_bookings_listing_created_idx on public.stay_bookings (listing_ref, created_at desc);

-- ───────────────────────────── staff ─────────────────────────────
-- Releases a live booking (support desk, or a hoarder): cancelled, beds freed. Money paid online is
-- refunded in full (the guest did not choose this), recorded as refund_due for the server to issue.
create function public.staff_release_stay(p_booking_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_b public.stay_bookings;
begin
  if not public.is_staff() then
    raise exception using errcode = 'ZV403', message = 'Staff only.';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 300 then
    raise exception using errcode = 'ZV422', message = 'Give a reason (3 to 300 characters).';
  end if;
  select * into v_b from public.stay_bookings where id = p_booking_id for update;
  if not found then
    raise exception using errcode = 'ZV404', message = 'Booking not found.';
  end if;
  if v_b.status not in ('pending_payment', 'confirmed') then
    raise exception using errcode = 'ZV409', message = 'This booking is already ' || replace(v_b.status, '_', ' ') || '.';
  end if;

  update public.stay_bookings
     set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Released by Zovia: ' || btrim(p_reason),
         refund_inr = case when paid then amount_total_inr else 0 end,
         refund_status = case when paid then 'refund_due' else 'none' end
   where id = v_b.id
  returning * into v_b;

  perform public.notify(v_b.user_id, 'system', 'Your stay booking was cancelled by Zovia', btrim(p_reason),
                        '/bookings/' || v_b.id::text);
  return public.stay_booking_json(v_b) || jsonb_build_object('user_id', v_b.user_id);
end
$$;
revoke all on function public.staff_release_stay(uuid, text) from public;
grant execute on function public.staff_release_stay(uuid, text) to authenticated;

-- Staff list of stay bookings, newest first, optionally for one listing or status.
create function public.staff_list_stay_bookings(p_listing text default null, p_status text default null, p_limit integer default 50)
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
  return coalesce((
    select jsonb_agg(public.stay_booking_json(b) || jsonb_build_object('user_id', b.user_id) order by b.created_at desc)
      from (select * from public.stay_bookings s
             where (p_listing is null or s.listing_ref = p_listing)
               and (p_status is null or s.status = p_status)
             order by s.created_at desc
             limit least(greatest(coalesce(p_limit, 50), 1), 200)) b
  ), '[]'::jsonb);
end
$$;
revoke all on function public.staff_list_stay_bookings(text, text, integer) from public;
grant execute on function public.staff_list_stay_bookings(text, text, integer) to authenticated;
