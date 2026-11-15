-- Booking under heavy contention (many people booking the same bed at the same moment).
--
-- request_booking() locks the bed row (SELECT ... FOR UPDATE) and unique indexes forbid two live
-- bookings of one bed, so double booking is already impossible. Under a stampede, though, every
-- waiter would hold a database connection while queueing on that one row lock. These limits make
-- the losers fail fast with a clear "just taken" answer instead of exhausting the connection pool.
alter function public.request_booking(uuid, date, smallint, uuid, text) set lock_timeout = '3s';
alter function public.request_booking(uuid, date, smallint, uuid, text) set statement_timeout = '10s';

-- Fast lookups for the hot booking paths.
create index if not exists bookings_property_status_idx on public.bookings (property_id, status);
create index if not exists bookings_seeker_created_idx on public.bookings (seeker_id, created_at desc);
