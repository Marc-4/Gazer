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
      WHERE id IS NOT NULL
      RETURNING *
    )
    SELECT * FROM deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_admin_notifications() FROM public;
GRANT EXECUTE ON FUNCTION public.consume_admin_notifications() TO authenticated;

NOTIFY pgrst, 'reload schema';
