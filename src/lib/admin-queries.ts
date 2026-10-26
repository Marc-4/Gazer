import { todayIsoDate } from "./format";
import { supabase } from "./supabase";
import type {
	AuditLogEntry,
	BookingStatus,
	BookingWithVenue,
	EmailTemplate,
	NotificationOutboxItem,
	NotificationStatus,
	OpenSeason,
	Profile,
	SchoolEventWithVenue,
	Venue,
} from "./types";

export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export interface PageResult<T> {
	rows: T[];
	total: number;
}

export type BookingFilter = "all" | BookingStatus;
export type VenueFilter = "all" | "active" | "inactive";
export type VenueCapacityFilter = "all" | "small" | "medium" | "large";
export type OpenSeasonFilter =
	| "all"
	| "active"
	| "upcoming"
	| "ended"
	| "disabled";
export type SchoolEventFilter = "upcoming" | "past" | "all";
export type UserFilter = "all" | "admin" | "booker";
export type UserStatusFilter = "all" | "active" | "inactive";
export type OutboxTemplateFilter = "all" | EmailTemplate;

export interface VenueOption {
	id: string;
	name: string;
}

export function buildSearchFilter(columns: string[], query: string) {
	const term = query
		.trim()
		.replace(/[%_\\,()"*]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	if (!term) return null;
	return columns.map((column) => `${column}.ilike.%${term}%`).join(",");
}

export async function fetchBookingsPage({
	page,
	pageSize,
	filter,
	query,
	venueId,
	bookingDate,
}: {
	page: number;
	pageSize: number;
	filter: BookingFilter;
	query: string;
	venueId: string;
	bookingDate: string;
}): Promise<PageResult<BookingWithVenue>> {
	const from = (page - 1) * pageSize;
	let request = supabase
		.from("bookings_search")
		.select("*", { count: "exact" });

	if (filter !== "all") request = request.eq("status", filter);
	if (venueId !== "all") request = request.eq("venue_id", venueId);
	if (bookingDate) request = request.eq("booking_date", bookingDate);

	const search = buildSearchFilter(
		[
			"reference",
			"activity_name",
			"requester_name",
			"requester_email",
			"organization_name",
			"venue_name",
		],
		query,
	);
	if (search) request = request.or(search);

	const { data, error, count } = await request
		.order("created_at", { ascending: false })
		.order("id", { ascending: false })
		.range(from, from + pageSize - 1);

	if (error) throw error;
	return { rows: (data as BookingWithVenue[] | null) ?? [], total: count ?? 0 };
}

export async function fetchBookingById(id: string) {
	const { data, error } = await supabase
		.from("bookings_search")
		.select("*")
		.eq("id", id)
		.maybeSingle();

	if (error) throw error;
	return (data as BookingWithVenue | null) ?? null;
}

export async function countBookings() {
	const { count, error } = await supabase
		.from("bookings")
		.select("id", { count: "exact", head: true });

	if (error) throw error;
	return count ?? 0;
}

export async function fetchVenueById(id: string) {
	const { data, error } = await supabase
		.from("venues")
		.select("*")
		.eq("id", id)
		.maybeSingle();

	if (error) throw error;
	return (data as Venue | null) ?? null;
}

export async function fetchVenueOptions(): Promise<VenueOption[]> {
	const { data, error } = await supabase
		.from("venues")
		.select("id, name")
		.order("name")
		.order("id");

	if (error) throw error;
	return (data as VenueOption[] | null) ?? [];
}

export async function fetchVenuesPage({
	page,
	pageSize,
	filter,
	query,
	capacity,
}: {
	page: number;
	pageSize: number;
	filter: VenueFilter;
	query: string;
	capacity: VenueCapacityFilter;
}): Promise<PageResult<Venue>> {
	const from = (page - 1) * pageSize;
	let request = supabase.from("venues").select("*", { count: "exact" });

	if (filter === "active") request = request.eq("is_active", true);
	if (filter === "inactive") request = request.eq("is_active", false);
	if (capacity === "small") request = request.lt("capacity", 50);
	if (capacity === "medium")
		request = request.gte("capacity", 50).lte("capacity", 100);
	if (capacity === "large") request = request.gt("capacity", 100);

	const search = buildSearchFilter(
		["name", "slug", "address", "description"],
		query,
	);
	if (search) request = request.or(search);

	const { data, error, count } = await request
		.order("name")
		.order("id")
		.range(from, from + pageSize - 1);

	if (error) throw error;
	return { rows: (data as Venue[] | null) ?? [], total: count ?? 0 };
}

export async function fetchVenueCounts() {
	const [all, active] = await Promise.all([
		supabase.from("venues").select("id", { count: "exact", head: true }),
		supabase
			.from("venues")
			.select("id", { count: "exact", head: true })
			.eq("is_active", true),
	]);

	if (all.error) throw all.error;
	if (active.error) throw active.error;
	return { total: all.count ?? 0, active: active.count ?? 0 };
}

export async function fetchVenueBookingCounts(venueIds: string[]) {
	if (venueIds.length === 0) return {} as Record<string, number>;

	const { data, error } = await supabase
		.from("venue_upcoming_booking_counts")
		.select("venue_id, booking_count")
		.in("venue_id", venueIds);

	if (error) throw error;

	const counts: Record<string, number> = {};
	for (const row of (data as Array<{
		venue_id: string;
		booking_count: number;
	}> | null) ?? []) {
		counts[row.venue_id] = row.booking_count;
	}
	return counts;
}

export async function fetchOpenSeasonsPage({
	page,
	pageSize,
	filter,
	query,
}: {
	page: number;
	pageSize: number;
	filter: OpenSeasonFilter;
	query: string;
}): Promise<PageResult<OpenSeason>> {
	const from = (page - 1) * pageSize;
	const now = new Date().toISOString();
	let request = supabase.from("open_seasons").select("*", { count: "exact" });

	if (filter === "active") {
		request = request
			.eq("is_enabled", true)
			.lte("starts_at", now)
			.gt("ends_at", now);
	} else if (filter === "upcoming") {
		request = request.eq("is_enabled", true).gt("starts_at", now);
	} else if (filter === "ended") {
		request = request.eq("is_enabled", true).lte("ends_at", now);
	} else if (filter === "disabled") {
		request = request.eq("is_enabled", false);
	}

	const search = buildSearchFilter(["name", "description"], query);
	if (search) request = request.or(search);

	const { data, error, count } = await request
		.order("starts_at", { ascending: false })
		.order("id", { ascending: false })
		.range(from, from + pageSize - 1);

	if (error) throw error;
	return { rows: (data as OpenSeason[] | null) ?? [], total: count ?? 0 };
}

export async function fetchOpenSeasonCounts() {
	const now = new Date().toISOString();
	const [all, active] = await Promise.all([
		supabase.from("open_seasons").select("id", { count: "exact", head: true }),
		supabase
			.from("open_seasons")
			.select("id", { count: "exact", head: true })
			.eq("is_enabled", true)
			.lte("starts_at", now)
			.gt("ends_at", now),
	]);

	if (all.error) throw all.error;
	if (active.error) throw active.error;
	return { total: all.count ?? 0, active: active.count ?? 0 };
}

export async function fetchSchoolEventsPage({
	page,
	pageSize,
	filter,
	query,
	venueId,
	eventDate,
}: {
	page: number;
	pageSize: number;
	filter: SchoolEventFilter;
	query: string;
	venueId: string;
	eventDate: string;
}): Promise<PageResult<SchoolEventWithVenue>> {
	const from = (page - 1) * pageSize;
	const today = todayIsoDate();
	let request = supabase
		.from("school_events_search")
		.select("*", { count: "exact" });

	if (filter === "upcoming") request = request.gte("event_date", today);
	if (filter === "past") request = request.lt("event_date", today);
	if (venueId !== "all") request = request.eq("venue_id", venueId);
	if (eventDate) request = request.eq("event_date", eventDate);

	const search = buildSearchFilter(
		["title", "description", "venue_name"],
		query,
	);
	if (search) request = request.or(search);

	const { data, error, count } = await request
		.order("event_date", { ascending: filter === "upcoming" })
		.order("id", { ascending: filter === "upcoming" })
		.range(from, from + pageSize - 1);

	if (error) throw error;
	return {
		rows: (data as SchoolEventWithVenue[] | null) ?? [],
		total: count ?? 0,
	};
}

export async function fetchSchoolEventCounts() {
	const today = todayIsoDate();
	const [all, upcoming] = await Promise.all([
		supabase.from("school_events").select("id", { count: "exact", head: true }),
		supabase
			.from("school_events")
			.select("id", { count: "exact", head: true })
			.gte("event_date", today),
	]);

	if (all.error) throw all.error;
	if (upcoming.error) throw upcoming.error;
	return { total: all.count ?? 0, upcoming: upcoming.count ?? 0 };
}

export type AuditLogFilter = "all" | BookingStatus;

export async function fetchAuditLogPage({
	page,
	pageSize,
	filter,
	query,
	venueId,
	bookingDate,
}: {
	page: number;
	pageSize: number;
	filter: AuditLogFilter;
	query: string;
	venueId: string;
	bookingDate: string;
}): Promise<PageResult<AuditLogEntry>> {
	const from = (page - 1) * pageSize;
	let request = supabase
		.from("booking_status_history_search")
		.select("*", { count: "exact" });

	if (filter !== "all") request = request.eq("to_status", filter);
	if (venueId !== "all") request = request.eq("venue_id", venueId);
	if (bookingDate) request = request.eq("booking_date", bookingDate);

	const search = buildSearchFilter(
		[
			"reference",
			"activity_name",
			"requester_name",
			"venue_name",
			"changed_by_name",
			"changed_by_email",
			"note",
		],
		query,
	);
	if (search) request = request.or(search);

	const { data, error, count } = await request
		.order("created_at", { ascending: false })
		.order("id", { ascending: false })
		.range(from, from + pageSize - 1);

	if (error) throw error;
	return { rows: (data as AuditLogEntry[] | null) ?? [], total: count ?? 0 };
}

export async function countAuditLogEntries() {
	const { count, error } = await supabase
		.from("booking_status_history")
		.select("id", { count: "exact", head: true });

	if (error) throw error;
	return count ?? 0;
}

export async function fetchUsersPage({
	page,
	pageSize,
	filter,
	status,
	query,
}: {
	page: number;
	pageSize: number;
	filter: UserFilter;
	status: UserStatusFilter;
	query: string;
}): Promise<PageResult<Profile>> {
	const from = (page - 1) * pageSize;
	let request = supabase.from("profiles").select("*", { count: "exact" });

	if (filter === "admin") request = request.eq("role", "admin");
	if (filter === "booker") request = request.eq("role", "booker");
	if (status === "active") request = request.eq("is_active", true);
	if (status === "inactive") request = request.eq("is_active", false);

	const search = buildSearchFilter(
		["email", "full_name", "organization", "phone"],
		query,
	);
	if (search) request = request.or(search);

	const { data, error, count } = await request
		.order("created_at", { ascending: false })
		.order("id", { ascending: false })
		.range(from, from + pageSize - 1);

	if (error) throw error;
	return { rows: (data as Profile[] | null) ?? [], total: count ?? 0 };
}

export async function fetchUserCounts() {
	const [all, admins, inactive] = await Promise.all([
		supabase.from("profiles").select("id", { count: "exact", head: true }),
		supabase
			.from("profiles")
			.select("id", { count: "exact", head: true })
			.eq("role", "admin"),
		supabase
			.from("profiles")
			.select("id", { count: "exact", head: true })
			.eq("is_active", false),
	]);

	if (all.error) throw all.error;
	if (admins.error) throw admins.error;
	if (inactive.error) throw inactive.error;
	return {
		total: all.count ?? 0,
		admins: admins.count ?? 0,
		inactive: inactive.count ?? 0,
	};
}

export type OutboxFilter = "all" | NotificationStatus;

export async function fetchOutboxPage({
	page,
	pageSize,
	filter,
	template,
	query,
}: {
	page: number;
	pageSize: number;
	filter: OutboxFilter;
	template: OutboxTemplateFilter;
	query: string;
}): Promise<PageResult<NotificationOutboxItem>> {
	const from = (page - 1) * pageSize;
	let request = supabase
		.from("notification_outbox")
		.select("*", { count: "exact" });

	if (filter !== "all") request = request.eq("status", filter);
	if (template !== "all") request = request.eq("template", template);

	const search = buildSearchFilter(
		["recipient_email", "recipient_name"],
		query,
	);
	if (search) request = request.or(search);

	const { data, error, count } = await request
		.order("created_at", { ascending: false })
		.order("id", { ascending: false })
		.range(from, from + pageSize - 1);

	if (error) throw error;
	return {
		rows: (data as NotificationOutboxItem[] | null) ?? [],
		total: count ?? 0,
	};
}

export async function fetchOutboxCounts() {
	const [all, pending, sent, failed, cancelled] = await Promise.all([
		supabase
			.from("notification_outbox")
			.select("id", { count: "exact", head: true }),
		supabase
			.from("notification_outbox")
			.select("id", { count: "exact", head: true })
			.eq("status", "pending"),
		supabase
			.from("notification_outbox")
			.select("id", { count: "exact", head: true })
			.eq("status", "sent"),
		supabase
			.from("notification_outbox")
			.select("id", { count: "exact", head: true })
			.eq("status", "failed"),
		supabase
			.from("notification_outbox")
			.select("id", { count: "exact", head: true })
			.eq("status", "cancelled"),
	]);

	if (all.error) throw all.error;
	if (pending.error) throw pending.error;
	if (sent.error) throw sent.error;
	if (failed.error) throw failed.error;
	if (cancelled.error) throw cancelled.error;

	return {
		all: all.count ?? 0,
		pending: pending.count ?? 0,
		sent: sent.count ?? 0,
		failed: failed.count ?? 0,
		cancelled: cancelled.count ?? 0,
	};
}
