-- Custom SQL migration file, put your code below! --
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_no_overlap";
--> statement-breakpoint
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "venue_id" WITH =,
    tsrange("booking_date" + "start_time", "booking_date" + "end_time", '[)') WITH &&
  )
  WHERE (
    "status" = 'approved'
    AND "start_time" IS NOT NULL
    AND "end_time" IS NOT NULL
  );
