import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	date,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	time,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

export const appRole = pgEnum("app_role", ["admin", "booker"]);

export const bookingStatus = pgEnum("booking_status", [
	"pending",
	"approved",
	"rejected",
	"cancelled",
]);

export const emailTemplate = pgEnum("email_template", [
	"admin_new_booking",
	"admin_booking_cancelled",
	"booker_booking_pending",
	"booker_booking_approved",
	"booker_booking_rejected",
	"booker_booking_cancelled",
]);

export const notificationStatus = pgEnum("notification_status", [
	"pending",
	"sent",
	"failed",
]);

/**
 * Application user profile.
 *
 * `id`, `email` and `full_name` are synchronised from `auth.users` by a trigger
 * created in the Supabase custom migration. The foreign key to `auth.users` is
 * also added there because the auth schema is owned by Supabase.
 */
export const profiles = pgTable(
	"profiles",
	{
		id: uuid("id").primaryKey(),
		email: text("email"),
		fullName: text("full_name"),
		organization: text("organization"),
		phone: text("phone"),
		role: appRole("role").notNull().default("booker"),
		isActive: boolean("is_active").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("profiles_email_lower_uidx")
			.on(sql`lower(${table.email})`)
			.where(sql`${table.email} is not null`),
		index("profiles_role_idx").on(table.role).where(sql`${table.isActive}`),
	],
);

export const venues = pgTable(
	"venues",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		description: text("description"),
		address: text("address"),
		capacity: integer("capacity"),
		isActive: boolean("is_active").notNull().default(true),
		createdBy: uuid("created_by")
			.default(sql`auth.uid()`)
			.references(() => profiles.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("venues_slug_lower_uidx").on(sql`lower(${table.slug})`),
		uniqueIndex("venues_name_lower_uidx").on(sql`lower(${table.name})`),
		index("venues_active_idx").on(table.name).where(sql`${table.isActive}`),
		check("venues_name_not_blank", sql`length(trim(${table.name})) > 0`),
		check("venues_slug_not_blank", sql`length(trim(${table.slug})) > 0`),
		check(
			"venues_capacity_positive",
			sql`${table.capacity} is null or ${table.capacity} > 0`,
		),
	],
);

/**
 * Administratively managed school event.
 *
 * School events have priority over regular bookings: a school event reserves
 * its venue for the whole calendar date, so any pending or approved booking at
 * the same venue/date is cancelled automatically and new bookings are blocked.
 * Multiple school events may overlap each other at the same venue and date.
 */
export const schoolEvents = pgTable(
	"school_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		title: text("title").notNull(),
		description: text("description"),
		venueId: uuid("venue_id")
			.notNull()
			.references(() => venues.id, { onDelete: "restrict" }),
		eventDate: date("event_date", { mode: "string" }).notNull(),
		startTime: time("start_time"),
		endTime: time("end_time"),
		createdBy: uuid("created_by")
			.default(sql`auth.uid()`)
			.references(() => profiles.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("school_events_date_idx").on(table.eventDate),
		check(
			"school_events_title_not_blank",
			sql`length(trim(${table.title})) > 0`,
		),
		check(
			"school_events_time_order",
			sql`${table.startTime} is null or ${table.endTime} is null or ${table.endTime} > ${table.startTime}`,
		),
	],
);

/**
 * School activity booking request.
 *
 * `user_id` references `auth.users`, added in the Supabase custom migration.
 * The availability rule is enforced by the `bookings_no_overlap` exclusion
 * constraint in the Supabase migration: pending/approved bookings may not
 * overlap in time for the same venue. Bookings without times reserve the whole
 * date, and school events always reserve the whole date.
 */
export const bookings = pgTable(
	"bookings",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		reference: text("reference")
			.notNull()
			.unique()
			.default(
				sql`('BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)))`,
			),
		publicToken: uuid("public_token").notNull().unique().defaultRandom(),
		userId: uuid("user_id").default(sql`auth.uid()`),
		venueId: uuid("venue_id")
			.notNull()
			.references(() => venues.id, { onDelete: "restrict" }),
		bookingDate: date("booking_date", { mode: "string" }).notNull(),
		startTime: time("start_time"),
		endTime: time("end_time"),
		status: bookingStatus("status").notNull().default("pending"),
		activityName: text("activity_name").notNull(),
		activityDescription: text("activity_description"),
		organizationName: text("organization_name"),
		requesterName: text("requester_name").notNull(),
		requesterEmail: text("requester_email").notNull(),
		requesterPhone: text("requester_phone"),
		attendeeCount: integer("attendee_count"),
		isAutoApproved: boolean("is_auto_approved").notNull().default(false),
		decisionNote: text("decision_note"),
		decidedBy: uuid("decided_by").references(() => profiles.id, {
			onDelete: "set null",
		}),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
		cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("bookings_venue_date_idx").on(table.venueId, table.bookingDate),
		index("bookings_user_id_idx").on(table.userId),
		index("bookings_status_idx").on(table.status),
		index("bookings_requester_email_lower_idx").on(
			sql`lower(${table.requesterEmail})`,
		),
		check(
			"bookings_activity_name_not_blank",
			sql`length(trim(${table.activityName})) > 0`,
		),
		check(
			"bookings_requester_name_not_blank",
			sql`length(trim(${table.requesterName})) > 0`,
		),
		check(
			"bookings_requester_email_format",
			sql`${table.requesterEmail} ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'`,
		),
		check(
			"bookings_time_pair",
			sql`(${table.startTime} is null) = (${table.endTime} is null)`,
		),
		check(
			"bookings_time_order",
			sql`${table.startTime} is null or ${table.endTime} is null or ${table.endTime} > ${table.startTime}`,
		),
		check(
			"bookings_attendee_count_positive",
			sql`${table.attendeeCount} is null or ${table.attendeeCount} > 0`,
		),
	],
);

export const bookingStatusHistory = pgTable(
	"booking_status_history",
	{
		id: bigint("id", { mode: "number" })
			.primaryKey()
			.generatedAlwaysAsIdentity(),
		bookingId: uuid("booking_id")
			.notNull()
			.references(() => bookings.id, { onDelete: "cascade" }),
		fromStatus: bookingStatus("from_status"),
		toStatus: bookingStatus("to_status").notNull(),
		changedBy: uuid("changed_by").references(() => profiles.id, {
			onDelete: "set null",
		}),
		note: text("note"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("booking_status_history_booking_id_idx").on(
			table.bookingId,
			table.createdAt.desc(),
		),
	],
);

/**
 * In-app notifications for administrators.
 *
 * A database trigger inserts one row when a pending booking is created. The
 * bell UI marks notifications as seen without deleting them; a booking status
 * trigger removes the related row once the request is approved or rejected.
 */
export const adminNotifications = pgTable(
	"admin_notifications",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		bookingId: uuid("booking_id")
			.notNull()
			.references(() => bookings.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		message: text("message").notNull(),
		status: text("status").notNull().default("unseen"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("admin_notifications_created_at_idx").on(table.createdAt.desc()),
		index("admin_notifications_booking_id_idx").on(table.bookingId),
		index("admin_notifications_unseen_idx")
			.on(table.status)
			.where(sql`${table.status} = 'unseen'`),
		check(
			"admin_notifications_title_not_blank",
			sql`length(trim(${table.title})) > 0`,
		),
		check(
			"admin_notifications_message_not_blank",
			sql`length(trim(${table.message})) > 0`,
		),
		check(
			"admin_notifications_status_valid",
			sql`${table.status} in ('unseen', 'seen')`,
		),
	],
);

export const openSeasons = pgTable(
	"open_seasons",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		description: text("description"),
		startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
		endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
		isEnabled: boolean("is_enabled").notNull().default(true),
		createdBy: uuid("created_by")
			.default(sql`auth.uid()`)
			.references(() => profiles.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("open_seasons_active_idx")
			.on(table.startsAt, table.endsAt)
			.where(sql`${table.isEnabled}`),
		check("open_seasons_name_not_blank", sql`length(trim(${table.name})) > 0`),
		check("open_seasons_time_order", sql`${table.endsAt} > ${table.startsAt}`),
	],
);

/**
 * Singleton notification settings row.
 *
 * `automatic_emails_enabled` controls whether the Nitro scheduled task drains
 * the outbox without an administrator manually dispatching it.
 */
export const notificationSettings = pgTable(
	"notification_settings",
	{
		id: boolean("id").primaryKey().default(true),
		automaticEmailsEnabled: boolean("automatic_emails_enabled")
			.notNull()
			.default(false),
		updatedBy: uuid("updated_by")
			.default(sql`auth.uid()`)
			.references(() => profiles.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [check("notification_settings_singleton", sql`${table.id}`)],
);

/**
 * Transactional email outbox drained by a Brevo worker using the service role.
 */
export const notificationOutbox = pgTable(
	"notification_outbox",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		bookingId: uuid("booking_id").references(() => bookings.id, {
			onDelete: "cascade",
		}),
		template: emailTemplate("template").notNull(),
		recipientEmail: text("recipient_email").notNull(),
		recipientName: text("recipient_name"),
		payload: jsonb("payload")
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		status: notificationStatus("status").notNull().default("pending"),
		attempts: integer("attempts").notNull().default(0),
		lastError: text("last_error"),
		scheduledFor: timestamp("scheduled_for", { withTimezone: true })
			.notNull()
			.defaultNow(),
		sentAt: timestamp("sent_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("notification_outbox_pending_idx")
			.on(table.scheduledFor, table.createdAt)
			.where(sql`${table.status} = 'pending'`),
		index("notification_outbox_booking_id_idx").on(table.bookingId),
		check(
			"notification_outbox_recipient_format",
			sql`${table.recipientEmail} ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'`,
		),
		check(
			"notification_outbox_attempts_non_negative",
			sql`${table.attempts} >= 0`,
		),
	],
);
