CREATE OR REPLACE VIEW public.booking_status_history_search
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
  h.created_at,
  b.venue_id,
  b.booking_date,
  b.start_time,
  b.end_time
FROM public.booking_status_history h
JOIN public.bookings b ON b.id = h.booking_id
LEFT JOIN public.venues v ON v.id = b.venue_id
LEFT JOIN public.profiles p ON p.id = h.changed_by;

REVOKE ALL ON public.booking_status_history_search FROM anon, authenticated;
GRANT SELECT ON public.booking_status_history_search TO authenticated;

NOTIFY pgrst, 'reload schema';
