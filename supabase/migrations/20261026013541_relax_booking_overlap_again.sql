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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.booking_has_approved_conflict(
  p_booking_id uuid,
  p_venue_id uuid,
  p_booking_date date,
  p_start_time time without time zone,
  p_end_time time without time zone
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select
    p_start_time is not null
    and p_end_time is not null
    and exists (
      select 1
      from public.bookings b
      where b.id is distinct from p_booking_id
        and b.venue_id = p_venue_id
        and b.booking_date = p_booking_date
        and b.status = 'approved'
        and b.start_time is not null
        and b.end_time is not null
        and p_start_time < b.end_time
        and b.start_time < p_end_time
    );
$$;
