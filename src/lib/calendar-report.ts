import {
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	format,
	isSameMonth,
	parseISO,
	startOfMonth,
	startOfWeek,
} from "date-fns";
import { bookingStatusLabel, formatDateTime } from "./format";
import type {
	BookingStatus,
	BookingWithVenue,
	SchoolEventWithVenue,
} from "./types";

export const CALENDAR_FIRST_SCHEDULE_ROWS = 28;
export const CALENDAR_CONTINUATION_ROWS = 32;
export const CALENDAR_MAX_ITEMS_PER_DAY = 4;

export interface CalendarReportItem {
	id: string;
	kind: "event" | "booking";
	title: string;
	venueName: string;
	timeLabel: string;
	status: BookingStatus | null;
	requester: string | null;
	reference: string | null;
}

export interface CalendarReportDay {
	date: string;
	dayLabel: string;
	inMonth: boolean;
	items: CalendarReportItem[];
}

export interface CalendarReportWeek {
	days: CalendarReportDay[];
}

export interface CalendarReportRow {
	date: string;
	dateLabel: string;
	timeLabel: string;
	kindLabel: string;
	title: string;
	venueName: string;
	statusLabel: string;
	reference: string;
}

export interface CalendarReport {
	monthKey: string;
	monthLabel: string;
	venueLabel: string;
	statusLabel: string;
	generatedLabel: string;
	weeks: CalendarReportWeek[];
	rows: CalendarReportRow[];
	summary: {
		bookings: number;
		events: number;
		datesInUse: number;
		attendees: number;
	};
	fileName: string;
}

interface BuildCalendarReportOptions {
	/** Any date inside the month, a `yyyy-MM` key, or an ISO date string. */
	month: Date | string;
	bookings: BookingWithVenue[];
	events: SchoolEventWithVenue[];
	venueLabel?: string;
	statusLabel?: string;
	generatedAt?: Date | string;
}

function monthStart(value: Date | string) {
	if (value instanceof Date) return startOfMonth(value);
	const parsed = /^\d{4}-\d{2}$/.test(value)
		? parseISO(`${value}-01`)
		: parseISO(value);
	return startOfMonth(parsed);
}

function timeLabel(
	startTime: string | null | undefined,
	endTime: string | null | undefined,
) {
	if (!startTime && !endTime) return "All day";
	const start = startTime?.slice(0, 5) ?? null;
	const end = endTime?.slice(0, 5) ?? null;
	if (start && end) return `${start} – ${end}`;
	if (start) return `From ${start}`;
	return `Until ${end}`;
}

function sortItems(a: CalendarReportItem, b: CalendarReportItem) {
	if (a.kind !== b.kind) return a.kind === "event" ? -1 : 1;
	const aTime = a.timeLabel === "All day" ? "" : a.timeLabel;
	const bTime = b.timeLabel === "All day" ? "" : b.timeLabel;
	if (aTime !== bTime) return aTime.localeCompare(bTime);
	return a.title.localeCompare(b.title);
}

function bookingItem(booking: BookingWithVenue): CalendarReportItem {
	return {
		id: booking.id,
		kind: "booking",
		title: booking.activity_name,
		venueName: booking.venue?.name ?? "Unknown venue",
		timeLabel: timeLabel(booking.start_time, booking.end_time),
		status: booking.status,
		requester: booking.requester_name,
		reference: booking.reference,
	};
}

function eventItem(event: SchoolEventWithVenue): CalendarReportItem {
	return {
		id: event.id,
		kind: "event",
		title: event.title,
		venueName: event.venue?.name ?? "Unknown venue",
		timeLabel: timeLabel(event.start_time, event.end_time),
		status: null,
		requester: null,
		reference: null,
	};
}

export function buildCalendarReport({
	month,
	bookings,
	events,
	venueLabel = "All venues",
	statusLabel = "Active",
	generatedAt = new Date(),
}: BuildCalendarReportOptions): CalendarReport {
	const start = monthStart(month);
	const end = endOfMonth(start);
	const monthKey = format(start, "yyyy-MM");

	const itemsByDate = new Map<string, CalendarReportItem[]>();
	const addItem = (date: string, item: CalendarReportItem) => {
		const items = itemsByDate.get(date) ?? [];
		items.push(item);
		itemsByDate.set(date, items);
	};

	for (const event of events) addItem(event.event_date, eventItem(event));
	for (const booking of bookings)
		addItem(booking.booking_date, bookingItem(booking));

	const days = eachDayOfInterval({
		start: startOfWeek(start),
		end: endOfWeek(end),
	});
	const weeks: CalendarReportWeek[] = [];

	for (let index = 0; index < days.length; index += 7) {
		weeks.push({
			days: days.slice(index, index + 7).map((day) => {
				const date = format(day, "yyyy-MM-dd");
				return {
					date,
					dayLabel: format(day, "d"),
					inMonth: isSameMonth(day, start),
					items: [...(itemsByDate.get(date) ?? [])].sort(sortItems),
				};
			}),
		});
	}

	const monthBookings = bookings.filter((booking) =>
		booking.booking_date.startsWith(monthKey),
	);
	const monthEvents = events.filter((event) =>
		event.event_date.startsWith(monthKey),
	);

	const rows: CalendarReportRow[] = [];
	const monthDays = eachDayOfInterval({ start, end });
	for (const day of monthDays) {
		const date = format(day, "yyyy-MM-dd");
		const items = [...(itemsByDate.get(date) ?? [])].sort(sortItems);
		for (const item of items) {
			rows.push({
				date,
				dateLabel: format(day, "EEE, MMM d"),
				timeLabel: item.timeLabel,
				kindLabel: item.kind === "event" ? "School event" : "Booking",
				title: item.title,
				venueName: item.venueName,
				statusLabel: item.status ? bookingStatusLabel[item.status] : "Blocked",
				reference: item.reference ?? "—",
			});
		}
	}

	const datesInUse = new Set(rows.map((row) => row.date)).size;
	const attendees = monthBookings.reduce(
		(total, booking) => total + (booking.attendee_count ?? 0),
		0,
	);

	return {
		monthKey,
		monthLabel: format(start, "MMMM yyyy"),
		venueLabel,
		statusLabel,
		generatedLabel: formatDateTime(
			typeof generatedAt === "string" ? generatedAt : generatedAt.toISOString(),
		),
		weeks,
		rows,
		summary: {
			bookings: monthBookings.length,
			events: monthEvents.length,
			datesInUse,
			attendees,
		},
		fileName: `calendar-report_${monthKey}.pdf`,
	};
}

export function paginateCalendarRows(
	rows: CalendarReportRow[],
	firstPageSize = CALENDAR_FIRST_SCHEDULE_ROWS,
	continuationSize = CALENDAR_CONTINUATION_ROWS,
) {
	const pages: CalendarReportRow[][] = [];
	let offset = 0;
	let size = firstPageSize;

	while (offset < rows.length) {
		pages.push(rows.slice(offset, offset + size));
		offset += size;
		size = continuationSize;
	}

	return pages;
}
