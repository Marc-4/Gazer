import { todayIsoDate } from "./format";
import { supabase } from "./supabase";
import type { BookingStatus, Venue } from "./types";

export interface TurnaroundStats {
	count: number;
	avg_minutes: number | null;
	median_minutes: number | null;
}

export interface PendingAging {
	total: number;
	under_24h: number;
	one_to_three_days: number;
	over_three_days: number;
	oldest: Array<{
		id: string;
		reference: string;
		activity_name: string;
		requester_name: string;
		booking_date: string;
		created_at: string;
		venue_name: string | null;
		waited_hours: number;
	}>;
}

export interface OutcomeMix {
	total: number;
	pending: number;
	approved: number;
	rejected: number;
	cancelled: number;
	decided: number;
	auto_approved: number;
	auto_approved_share: number | null;
	approval_rate: number | null;
}

export interface VenueUtilization {
	venue_id: string;
	venue_name: string;
	capacity: number | null;
	is_active: boolean;
	upcoming_approved: number;
	upcoming_pending: number;
	upcoming_attendees: number;
	avg_fill_rate: number | null;
}

export interface TrendPoint {
	date: string;
	count: number;
}

export interface PeakTimeCell {
	dow: number;
	hour: number;
	count: number;
}

export interface NotificationHealth {
	status_counts: {
		total: number;
		pending: number;
		sent: number;
		failed: number;
		cancelled: number;
	};
	pending_backlog: number;
	failed: number;
	retries: number;
	total_attempts: number;
	sent_last_24h: number;
	oldest_pending_minutes: number | null;
	avg_lag_minutes: number | null;
	max_lag_minutes: number | null;
}

export interface CancellationDrivers {
	total: number;
	school_event: number;
	manual: number;
	last_30d_total: number;
	last_30d_school_event: number;
	last_30d_manual: number;
}

export interface RecentBooking {
	id: string;
	reference: string;
	public_token: string;
	activity_name: string;
	requester_name: string;
	status: BookingStatus;
	booking_date: string;
	start_time: string | null;
	end_time: string | null;
	created_at: string;
	venue: Pick<Venue, "id" | "name" | "address" | "capacity"> | null;
}

export interface AdminDashboard {
	generated_at: string;
	summary: {
		pending: number;
		approved_upcoming: number;
		active_venues: number;
		failed_notifications: number;
	};
	pending_aging: PendingAging;
	decision_turnaround: {
		all_time: TurnaroundStats;
		last_30_days: TurnaroundStats;
	};
	outcome_mix: OutcomeMix;
	venue_utilization: VenueUtilization[];
	demand_trend: TrendPoint[];
	schedule_density: TrendPoint[];
	peak_times: PeakTimeCell[];
	notification_health: NotificationHealth;
	cancellation_drivers: CancellationDrivers;
	recent_bookings: RecentBooking[];
}

export interface BookerNextBooking {
	id: string;
	reference: string;
	public_token: string;
	activity_name: string;
	booking_date: string;
	start_time: string | null;
	end_time: string | null;
	status: BookingStatus;
	venue: Pick<Venue, "id" | "name" | "address" | "capacity"> | null;
}

export interface BookerDashboard {
	generated_at: string;
	counts: {
		total: number;
		pending: number;
		approved: number;
		rejected: number;
		cancelled: number;
		upcoming: number;
		approval_rate: number | null;
	};
	waits: {
		avg_decision_wait_minutes: number | null;
		median_decision_wait_minutes: number | null;
		avg_pending_wait_hours: number | null;
	};
	most_used_venue: {
		venue_id: string;
		venue_name: string;
		booking_count: number;
	} | null;
	attendees: {
		total_attendees: number;
		approved_attendees: number;
		upcoming_attendees: number;
	};
	next_booking: BookerNextBooking | null;
}

export async function fetchAdminDashboard(): Promise<AdminDashboard> {
	const { data, error } = await supabase.rpc("get_admin_dashboard", {
		p_today: todayIsoDate(),
	});
	if (error) throw error;
	if (!data) throw new Error("No dashboard data returned");
	return data as AdminDashboard;
}

export async function fetchBookerDashboard(): Promise<BookerDashboard> {
	const { data, error } = await supabase.rpc("get_booker_dashboard", {
		p_today: todayIsoDate(),
	});
	if (error) throw error;
	if (!data) throw new Error("No dashboard data returned");
	return data as BookerDashboard;
}
