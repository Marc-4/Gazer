ALTER TABLE "admin_notifications" ADD COLUMN "status" text DEFAULT 'unseen' NOT NULL;--> statement-breakpoint
CREATE INDEX "admin_notifications_unseen_idx" ON "admin_notifications" USING btree ("status") WHERE "admin_notifications"."status" = 'unseen';--> statement-breakpoint
ALTER TABLE "admin_notifications" ADD CONSTRAINT "admin_notifications_status_valid" CHECK ("admin_notifications"."status" in ('unseen', 'seen'));
--> statement-breakpoint
-- Only unresolved booking requests should create an admin notification.
CREATE OR REPLACE FUNCTION public.create_admin_notification_for_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_name text;
BEGIN
  IF new.status <> 'pending' THEN
    RETURN new;
  END IF;

  SELECT name INTO v_venue_name
  FROM public.venues
  WHERE id = new.venue_id;

  INSERT INTO public.admin_notifications (booking_id, title, message)
  VALUES (
    new.id,
    'New booking request',
    format(
      '%s requested %s at %s on %s (%s).',
      new.requester_name,
      new.activity_name,
      coalesce(v_venue_name, 'a venue'),
      to_char(new.booking_date, 'Mon FMDD, YYYY'),
      new.reference
    )
  );

  RETURN new;
END;
$$;

-- Notifications disappear automatically once their booking is resolved.
CREATE OR REPLACE FUNCTION public.delete_resolved_booking_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.status IN ('approved', 'rejected')
    AND new.status IS DISTINCT FROM old.status
  THEN
    DELETE FROM public.admin_notifications
    WHERE booking_id = new.id;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS bookings_delete_resolved_notifications ON public.bookings;
CREATE TRIGGER bookings_delete_resolved_notifications
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_resolved_booking_notifications();

-- Opening the bell marks everything as seen and returns the full list without
-- deleting it. Rows are removed later by the booking status trigger.
CREATE OR REPLACE FUNCTION public.mark_admin_notifications_seen()
RETURNS SETOF public.admin_notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING errcode = '42501';
  END IF;

  UPDATE public.admin_notifications
  SET status = 'seen'
  WHERE status = 'unseen';

  RETURN QUERY
    SELECT *
    FROM public.admin_notifications
    ORDER BY created_at DESC;
END;
$$;

DROP FUNCTION IF EXISTS public.consume_admin_notifications();

DROP POLICY IF EXISTS admin_notifications_delete_admin ON public.admin_notifications;
REVOKE DELETE ON public.admin_notifications FROM authenticated;
GRANT SELECT ON public.admin_notifications TO authenticated;

REVOKE ALL ON FUNCTION public.create_admin_notification_for_booking() FROM public;
REVOKE ALL ON FUNCTION public.delete_resolved_booking_notifications() FROM public;
REVOKE ALL ON FUNCTION public.mark_admin_notifications_seen() FROM public;
GRANT EXECUTE ON FUNCTION public.mark_admin_notifications_seen() TO authenticated;

-- Audit log view keeps RLS active while exposing booking, venue, and actor
-- details needed by the admin audit table.
DROP VIEW IF EXISTS public.booking_status_history_search;
CREATE VIEW public.booking_status_history_search
WITH (security_invoker = true)
AS
SELECT
  h.id,
  h.booking_id,
  b.reference,
  b.activity_name,
  b.requester_name,
  b.status AS booking_status,
  v.name AS venue_name,
  h.from_status,
  h.to_status,
  h.changed_by,
  p.full_name AS changed_by_name,
  p.email AS changed_by_email,
  h.note,
  h.created_at
FROM public.booking_status_history h
JOIN public.bookings b ON b.id = h.booking_id
LEFT JOIN public.venues v ON v.id = b.venue_id
LEFT JOIN public.profiles p ON p.id = h.changed_by;

REVOKE ALL ON public.booking_status_history_search FROM anon, authenticated;
GRANT SELECT ON public.booking_status_history_search TO authenticated;

NOTIFY pgrst, 'reload schema';
