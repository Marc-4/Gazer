export type AppRole = "admin" | "booker";

export type BookingStatus = "pending" | "approved" | "rejected" | "cancelled";

export type EmailTemplate =
	| "admin_new_booking"
	| "admin_booking_cancelled"
	| "booker_booking_pending"
	| "booker_booking_approved"
	| "booker_booking_rejected"
	| "booker_booking_cancelled";

export type NotificationStatus = "pending" | "sent" | "failed" | "cancelled";

export interface Profile {
	id: string;
	email: string | null;
	full_name: string | null;
	organization: string | null;
	phone: string | null;
	role: AppRole;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export interface Venue {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	address: string | null;
	capacity: number | null;
	is_active: boolean;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface Booking {
	id: string;
	reference: string;
	public_token: string;
	user_id: string | null;
	venue_id: string;
	booking_date: string;
	start_time: string | null;
	end_time: string | null;
	status: BookingStatus;
	activity_name: string;
	activity_description: string | null;
	organization_name: string | null;
	requester_name: string;
	requester_email: string;
	requester_phone: string | null;
	attendee_count: number | null;
	is_auto_approved: boolean;
	decision_note: string | null;
	decided_by: string | null;
	decided_at: string | null;
	cancelled_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface BookingWithVenue extends Booking {
	venue: Pick<Venue, "id" | "name" | "address" | "capacity"> | null;
}

export type AvailabilityKind = "booking" | "school_event";

export type AvailabilityStatus = "pending" | "approved" | "blocked";

export interface AvailabilityEntry {
	venue_id: string;
	venue_name: string;
	booking_date: string;
	start_time: string | null;
	end_time: string | null;
	kind: AvailabilityKind;
	status: AvailabilityStatus;
	label: string | null;
}

export interface OpenSeason {
	id: string;
	name: string;
	description: string | null;
	starts_at: string;
	ends_at: string;
	is_enabled: boolean;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface SchoolEvent {
	id: string;
	title: string;
	description: string | null;
	venue_id: string;
	event_date: string;
	start_time: string | null;
	end_time: string | null;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface SchoolEventWithVenue extends SchoolEvent {
	venue: Pick<Venue, "id" | "name" | "address" | "capacity"> | null;
}

export type AdminNotificationStatus = "unseen" | "seen";

export interface AdminNotification {
	id: string;
	booking_id: string;
	title: string;
	message: string;
	status: AdminNotificationStatus;
	created_at: string;
}

export interface AuditLogEntry {
	id: string;
	booking_id: string;
	reference: string;
	activity_name: string;
	requester_name: string;
	booking_status: BookingStatus;
	venue_name: string | null;
	from_status: BookingStatus | null;
	to_status: BookingStatus;
	changed_by: string | null;
	changed_by_name: string | null;
	changed_by_email: string | null;
	note: string | null;
	created_at: string;
	venue_id: string | null;
	booking_date: string;
	start_time: string | null;
	end_time: string | null;
}

export interface NotificationSettings {
	id: boolean;
	automatic_emails_enabled: boolean;
	updated_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface NotificationOutboxItem {
	id: string;
	booking_id: string | null;
	template: EmailTemplate;
	recipient_email: string;
	recipient_name: string | null;
	payload: Record<string, unknown>;
	status: NotificationStatus;
	attempts: number;
	last_error: string | null;
	scheduled_for: string;
	sent_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface PublicBooking {
	id: string;
	reference: string;
	venue_name: string;
	venue_address: string | null;
	booking_date: string;
	start_time: string | null;
	end_time: string | null;
	status: BookingStatus;
	activity_name: string;
	activity_description: string | null;
	organization_name: string | null;
	requester_name: string;
	requester_email: string;
	requester_phone: string | null;
	attendee_count: number | null;
	decision_note: string | null;
	created_at: string;
	updated_at: string;
}

export interface BookingFormValues {
	venueId: string;
	bookingDate: string;
	startTime: string;
	endTime: string;
	activityName: string;
	activityDescription: string;
	organizationName: string;
	requesterName: string;
	requesterEmail: string;
	requesterPhone: string;
	attendeeCount: string;
}
