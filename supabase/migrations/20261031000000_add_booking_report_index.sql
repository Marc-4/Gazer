-- Booking report export pages through `bookings_search` ordered by
-- booking_date, start_time, and id (see fetchBookingReportRows). This index
-- lets Postgres satisfy the date range filter and the sort without a full
-- scan/sort of the bookings table.
create index if not exists bookings_booking_date_start_time_id_idx
  on public.bookings (booking_date, start_time, id);

analyze public.bookings;
