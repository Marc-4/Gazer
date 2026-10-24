CREATE TABLE "notification_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"automatic_emails_enabled" boolean DEFAULT false NOT NULL,
	"updated_by" uuid DEFAULT auth.uid(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_settings_singleton" CHECK ("notification_settings"."id")
);
--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "notification_settings" ("id") VALUES (true) ON CONFLICT ("id") DO NOTHING;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_notification_settings_updated_by()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_by := auth.uid();
  RETURN new;
END;
$$;

--> statement-breakpoint
DROP TRIGGER IF EXISTS notification_settings_set_updated_by ON public.notification_settings;
CREATE TRIGGER notification_settings_set_updated_by
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_notification_settings_updated_by();

--> statement-breakpoint
DROP TRIGGER IF EXISTS notification_settings_set_updated_at ON public.notification_settings;
CREATE TRIGGER notification_settings_set_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

--> statement-breakpoint
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint
DROP POLICY IF EXISTS notification_settings_select_admin ON public.notification_settings;
CREATE POLICY notification_settings_select_admin
  ON public.notification_settings
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

--> statement-breakpoint
DROP POLICY IF EXISTS notification_settings_insert_admin ON public.notification_settings;
CREATE POLICY notification_settings_insert_admin
  ON public.notification_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

--> statement-breakpoint
DROP POLICY IF EXISTS notification_settings_update_admin ON public.notification_settings;
CREATE POLICY notification_settings_update_admin
  ON public.notification_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

--> statement-breakpoint
REVOKE ALL ON public.notification_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_settings TO authenticated;

--> statement-breakpoint
REVOKE ALL ON FUNCTION public.set_notification_settings_updated_by() FROM public;
