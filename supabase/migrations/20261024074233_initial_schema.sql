CREATE TYPE "public"."app_role" AS ENUM('admin', 'booker');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."email_template" AS ENUM('admin_new_booking', 'admin_booking_cancelled', 'booker_booking_pending', 'booker_booking_approved', 'booker_booking_rejected', 'booker_booking_cancelled');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "booking_status_history" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "booking_status_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"booking_id" uuid NOT NULL,
	"from_status" "booking_status",
	"to_status" "booking_status" NOT NULL,
	"changed_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text DEFAULT ('BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))) NOT NULL,
	"public_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid(),
	"venue_id" uuid NOT NULL,
	"booking_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"activity_name" text NOT NULL,
	"activity_description" text,
	"organization_name" text,
	"requester_name" text NOT NULL,
	"requester_email" text NOT NULL,
	"requester_phone" text,
	"attendee_count" integer,
	"is_auto_approved" boolean DEFAULT false NOT NULL,
	"decision_note" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_reference_unique" UNIQUE("reference"),
	CONSTRAINT "bookings_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "bookings_activity_name_not_blank" CHECK (length(trim("bookings"."activity_name")) > 0),
	CONSTRAINT "bookings_requester_name_not_blank" CHECK (length(trim("bookings"."requester_name")) > 0),
	CONSTRAINT "bookings_requester_email_format" CHECK ("bookings"."requester_email" ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
	CONSTRAINT "bookings_time_order" CHECK ("bookings"."end_time" > "bookings"."start_time"),
	CONSTRAINT "bookings_attendee_count_positive" CHECK ("bookings"."attendee_count" is null or "bookings"."attendee_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"template" "email_template" NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_name" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_outbox_recipient_format" CHECK ("notification_outbox"."recipient_email" ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
	CONSTRAINT "notification_outbox_attempts_non_negative" CHECK ("notification_outbox"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "open_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "open_seasons_name_not_blank" CHECK (length(trim("open_seasons"."name")) > 0),
	CONSTRAINT "open_seasons_time_order" CHECK ("open_seasons"."ends_at" > "open_seasons"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"full_name" text,
	"organization" text,
	"phone" text,
	"role" "app_role" DEFAULT 'booker' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"address" text,
	"capacity" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venues_name_not_blank" CHECK (length(trim("venues"."name")) > 0),
	CONSTRAINT "venues_slug_not_blank" CHECK (length(trim("venues"."slug")) > 0),
	CONSTRAINT "venues_capacity_positive" CHECK ("venues"."capacity" is null or "venues"."capacity" > 0)
);
--> statement-breakpoint
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_changed_by_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_seasons" ADD CONSTRAINT "open_seasons_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_status_history_booking_id_idx" ON "booking_status_history" USING btree ("booking_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_active_venue_date_uidx" ON "bookings" USING btree ("venue_id","booking_date") WHERE "bookings"."status" in ('pending', 'approved');--> statement-breakpoint
CREATE INDEX "bookings_venue_date_idx" ON "bookings" USING btree ("venue_id","booking_date");--> statement-breakpoint
CREATE INDEX "bookings_user_id_idx" ON "bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bookings_requester_email_lower_idx" ON "bookings" USING btree (lower("requester_email"));--> statement-breakpoint
CREATE INDEX "notification_outbox_pending_idx" ON "notification_outbox" USING btree ("scheduled_for","created_at") WHERE "notification_outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "notification_outbox_booking_id_idx" ON "notification_outbox" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "open_seasons_active_idx" ON "open_seasons" USING btree ("starts_at","ends_at") WHERE "open_seasons"."is_enabled";--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_email_lower_uidx" ON "profiles" USING btree (lower("email")) WHERE "profiles"."email" is not null;--> statement-breakpoint
CREATE INDEX "profiles_role_idx" ON "profiles" USING btree ("role") WHERE "profiles"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "venues_slug_lower_uidx" ON "venues" USING btree (lower("slug"));--> statement-breakpoint
CREATE UNIQUE INDEX "venues_name_lower_uidx" ON "venues" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "venues_active_idx" ON "venues" USING btree ("name") WHERE "venues"."is_active";