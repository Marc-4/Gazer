import type { BookingStatus, NotificationStatus } from "./types";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
	weekday: "short",
	month: "short",
	day: "numeric",
	year: "numeric",
});

const longDateFormatter = new Intl.DateTimeFormat("en-US", {
	weekday: "long",
	month: "long",
	day: "numeric",
	year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
	hour: "numeric",
	minute: "2-digit",
});

export function formatDate(value: string | null | undefined) {
	if (!value) return "—";
	const date = toLocalDate(value);
	if (Number.isNaN(date.getTime())) return "—";
	return dateFormatter.format(date);
}

export function formatLongDate(value: string | null | undefined) {
	if (!value) return "—";
	const date = toLocalDate(value);
	if (Number.isNaN(date.getTime())) return "—";
	return longDateFormatter.format(date);
}

export function formatDateTime(value: string | null | undefined) {
	if (!value) return "—";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
	return dateTimeFormatter.format(date);
}

export function formatTime(value: string | null | undefined) {
	if (!value) return "—";
	const [hours = "0", minutes = "0"] = value.split(":");
	const date = new Date();
	date.setHours(Number(hours), Number(minutes), 0, 0);
	return new Intl.DateTimeFormat("en-US", {
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}

export function formatTimeRange(
	start: string | null | undefined,
	end: string | null | undefined,
) {
	if (!start && !end) return "Time not specified";
	if (!start) return `Until ${formatTime(end)}`;
	if (!end) return `From ${formatTime(start)}`;
	return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatRelativeToNow(value: string | null | undefined) {
	if (!value) return "—";
	const target = new Date(value).getTime();
	const diff = target - Date.now();
	const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
	const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
		["day", 86_400_000],
		["hour", 3_600_000],
		["minute", 60_000],
	];
	for (const [unit, ms] of units) {
		if (Math.abs(diff) >= ms || unit === "minute") {
			return formatter.format(Math.round(diff / ms), unit);
		}
	}
	return "now";
}

export function toLocalDate(value: string) {
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return new Date(`${value}T00:00:00`);
	}
	return new Date(value);
}

export function todayIsoDate() {
	const now = new Date();
	const offset = now.getTimezoneOffset();
	return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export const DEFAULT_START_TIME = "";
export const DEFAULT_END_TIME = "";

export function todayAtTimeLocal(time: string) {
	return `${todayIsoDate()}T${time}`;
}

export function toDateTimeLocal(value: string | null | undefined) {
	if (!value) return "";
	const date = new Date(value);
	const offset = date.getTimezoneOffset();
	return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string) {
	if (!value) return "";
	return new Date(value).toISOString();
}

export function slugify(value: string) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

export const bookingStatusLabel: Record<BookingStatus, string> = {
	pending: "Pending",
	approved: "Approved",
	rejected: "Rejected",
	cancelled: "Cancelled",
};

export const notificationStatusLabel: Record<NotificationStatus, string> = {
	pending: "Pending",
	sent: "Sent",
	failed: "Failed",
	cancelled: "Cancelled",
};

export const emailTemplateLabel: Record<string, string> = {
	admin_new_booking: "Admin · new booking",
	admin_booking_cancelled: "Admin · booking cancelled",
	booker_booking_pending: "Booker · request pending",
	booker_booking_approved: "Booker · approved",
	booker_booking_rejected: "Booker · rejected",
	booker_booking_cancelled: "Booker · cancelled",
};
