CREATE TABLE "admin_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_notifications_title_not_blank" CHECK (length(trim("admin_notifications"."title")) > 0),
	CONSTRAINT "admin_notifications_message_not_blank" CHECK (length(trim("admin_notifications"."message")) > 0)
);
--> statement-breakpoint
ALTER TABLE "admin_notifications" ADD CONSTRAINT "admin_notifications_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_notifications_created_at_idx" ON "admin_notifications" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_notifications_booking_id_idx" ON "admin_notifications" USING btree ("booking_id");

--> statement-breakpoint
-- New bookings create an in-app notification for administrators instead of
-- enqueueing an email to every admin account.
CREATE OR REPLACE FUNCTION public.create_admin_notification_for_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_name text;
BEGIN
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

DROP TRIGGER IF EXISTS bookings_create_admin_notification ON public.bookings;
CREATE TRIGGER bookings_create_admin_notification
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.create_admin_notification_for_booking();

-- Keep the booker email notifications, but stop queuing admin new-booking
-- emails. Pending/failed admin new-booking messages are discarded so they are
-- not delivered by the automatic worker after this migration.
DELETE FROM public.notification_outbox
WHERE template = 'admin_new_booking'
  AND status IN ('pending', 'failed');

CREATE OR REPLACE FUNCTION public.enqueue_booking_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_name text;
  v_payload jsonb;
  v_booker_template public.email_template;
BEGIN
  SELECT name INTO v_venue_name
  FROM public.venues
  WHERE id = new.venue_id;

  v_payload := jsonb_build_object(
    'booking_id', new.id,
    'reference', new.reference,
    'public_token', new.public_token,
    'venue_id', new.venue_id,
    'venue_name', v_venue_name,
    'booking_date', new.booking_date,
    'start_time', new.start_time,
    'end_time', new.end_time,
    'status', new.status,
    'activity_name', new.activity_name,
    'activity_description', new.activity_description,
    'organization_name', new.organization_name,
    'requester_name', new.requester_name,
    'requester_email', new.requester_email,
    'requester_phone', new.requester_phone,
    'attendee_count', new.attendee_count,
    'decision_note', new.decision_note
  );

  IF tg_op = 'INSERT' THEN
    v_booker_template := CASE
      WHEN new.status = 'approved' THEN 'booker_booking_approved'::public.email_template
      ELSE 'booker_booking_pending'::public.email_template
    END;

    INSERT INTO public.notification_outbox (
      booking_id,
      template,
      recipient_email,
      recipient_name,
      payload
    )
    VALUES (
      new.id,
      v_booker_template,
      new.requester_email,
      new.requester_name,
      v_payload
    );
  ELSIF new.status IS DISTINCT FROM old.status THEN
    v_booker_template := CASE new.status
      WHEN 'approved' THEN 'booker_booking_approved'::public.email_template
      WHEN 'rejected' THEN 'booker_booking_rejected'::public.email_template
      WHEN 'cancelled' THEN 'booker_booking_cancelled'::public.email_template
      ELSE 'booker_booking_pending'::public.email_template
    END;

    INSERT INTO public.notification_outbox (
      booking_id,
      template,
      recipient_email,
      recipient_name,
      payload
    )
    VALUES (
      new.id,
      v_booker_template,
      new.requester_email,
      new.requester_name,
      v_payload
    );

    IF new.status = 'cancelled' THEN
      INSERT INTO public.notification_outbox (
        booking_id,
        template,
        recipient_email,
        recipient_name,
        payload
      )
      SELECT
        new.id,
        'admin_booking_cancelled'::public.email_template,
        p.email,
        p.full_name,
        v_payload
      FROM public.profiles p
      WHERE p.role = 'admin'
        AND p.is_active
        AND p.email IS NOT NULL;
    END IF;
  END IF;

  RETURN new;
END;
$$;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_notifications_select_admin ON public.admin_notifications;
CREATE POLICY admin_notifications_select_admin
  ON public.admin_notifications
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_notifications_delete_admin ON public.admin_notifications;
CREATE POLICY admin_notifications_delete_admin
  ON public.admin_notifications
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

REVOKE ALL ON public.admin_notifications FROM anon, authenticated;
GRANT SELECT, DELETE ON public.admin_notifications TO authenticated;

-- Atomically return the notifications shown in the bell window and delete them
-- from the database so each notification is only surfaced once.
CREATE OR REPLACE FUNCTION public.consume_admin_notifications()
RETURNS SETOF public.admin_notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING errcode = '42501';
  END IF;

  RETURN QUERY
    WITH deleted AS (
      DELETE FROM public.admin_notifications
      RETURNING *
    )
    SELECT * FROM deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_notification_for_booking() FROM public;
REVOKE ALL ON FUNCTION public.consume_admin_notifications() FROM public;
GRANT EXECUTE ON FUNCTION public.consume_admin_notifications() TO authenticated;

NOTIFY pgrst, 'reload schema';