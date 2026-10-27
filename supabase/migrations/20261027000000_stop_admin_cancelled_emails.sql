-- Stop queuing admin emails when bookings are cancelled.
-- Keep booker cancellation emails, but no longer notify admins via email.

-- Discard pending/failed admin cancellation messages so they are not delivered
-- by the automatic worker after this migration.
DELETE FROM public.notification_outbox
WHERE template = 'admin_booking_cancelled'
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

    -- Admin cancellation emails are no longer enqueued.
  END IF;

  RETURN new;
END;
$$;

NOTIFY pgrst, 'reload schema';
