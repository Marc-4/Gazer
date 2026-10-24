DROP INDEX "bookings_active_venue_date_uidx";--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_time_pair" CHECK (("bookings"."start_time" is null) = ("bookings"."end_time" is null));

--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

--> statement-breakpoint
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS "bookings_no_overlap";
ALTER TABLE public.bookings ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    venue_id WITH =,
    (
      CASE
        WHEN start_time IS NULL OR end_time IS NULL
          THEN tsrange(booking_date::timestamp, (booking_date + 1)::timestamp, '[)')
        ELSE tsrange((booking_date + start_time)::timestamp, (booking_date + end_time)::timestamp, '[)')
      END
    ) WITH &&
  )
  WHERE (status IN ('pending', 'approved'));

