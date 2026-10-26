-- Indexes matching the admin listing, dashboard, availability, and calendar
-- queries. Keep the existing venue/date index for venue-scoped lookups.
create index if not exists bookings_created_at_id_idx
  on public.bookings (created_at desc, id desc);

create index if not exists bookings_status_created_at_id_idx
  on public.bookings (status, created_at desc, id desc);

create index if not exists bookings_user_date_idx
  on public.bookings (user_id, booking_date desc);

create index if not exists bookings_active_date_venue_idx
  on public.bookings (booking_date, venue_id)
  where status in ('pending', 'approved');

drop index if exists public.bookings_status_idx;
drop index if exists public.bookings_user_id_idx;

create index if not exists booking_status_history_created_at_id_idx
  on public.booking_status_history (created_at desc, id desc);

create index if not exists notification_outbox_created_at_id_idx
  on public.notification_outbox (created_at desc, id desc);

create index if not exists notification_outbox_status_created_at_id_idx
  on public.notification_outbox (status, created_at desc, id desc);

create index if not exists profiles_created_at_id_idx
  on public.profiles (created_at desc, id desc);

create index if not exists school_events_venue_date_idx
  on public.school_events (venue_id, event_date);

analyze public.bookings;
analyze public.booking_status_history;
analyze public.notification_outbox;
analyze public.profiles;
analyze public.school_events;
