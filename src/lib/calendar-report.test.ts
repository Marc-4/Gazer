import { describe, expect, it } from "vitest";
import {
	buildCalendarReport,
	CALENDAR_CONTINUATION_ROWS,
	CALENDAR_FIRST_SCHEDULE_ROWS,
	paginateCalendarRows,
} from "./calendar-report";
import type { BookingWithVenue, SchoolEventWithVenue } from "./types";

function booking(overrides: Partial<BookingWithVenue> = {}): BookingWithVenue {
	return {
		id: "booking-1",
		reference: "BK-000000000001",
		public_token: "00000000-0000-4000-8000-000000000001",
		user_id: null,
		venue_id: "venue-1",
		booking_date: "2026-10-05",
		start_time: "09:00:00",
		end_time: "11:00:00",
		status: "approved",
		activity_name: "Science Fair",
		activity_description: null,
		organization_name: "Science Club",
		requester_name: "Maria Santos",
		requester_email: "maria@example.com",
		requester_phone: null,
		attendee_count: 120,
		client_device_id: null,
		is_auto_approved: false,
		decision_note: null,
		decided_by: null,
		decided_at: null,
		cancelled_at: null,
		created_at: "2026-10-01T08:00:00Z",
		updated_at: "2026-10-01T08:00:00Z",
		venue: { id: "venue-1", name: "Main hall", address: null, capacity: 200 },
		...overrides,
	};
}

function event(
	overrides: Partial<SchoolEventWithVenue> = {},
): SchoolEventWithVenue {
	return {
		id: "event-1",
		title: "Foundation Day",
		description: null,
		venue_id: "venue-1",
		event_date: "2026-10-05",
		start_time: null,
		end_time: null,
		created_by: null,
		created_at: "2026-10-01T08:00:00Z",
		updated_at: "2026-10-01T08:00:00Z",
		venue: { id: "venue-1", name: "Main hall", address: null, capacity: 200 },
		...overrides,
	};
}

describe("buildCalendarReport", () => {
	const report = buildCalendarReport({
		month: "2026-10-15",
		bookings: [
			booking(),
			booking({
				id: "booking-2",
				reference: "BK-000000000002",
				booking_date: "2026-10-06",
				start_time: null,
				end_time: null,
				status: "pending",
				activity_name: "Robotics Club",
				attendee_count: 30,
			}),
			booking({
				id: "booking-3",
				reference: "BK-000000000003",
				booking_date: "2026-11-02",
				activity_name: "Next month",
			}),
		],
		events: [event()],
		venueLabel: "All venues",
		statusLabel: "Active",
		generatedAt: "2026-10-31T17:00:00",
	});

	it("lays out the month as seven-day weeks", () => {
		expect(report.weeks).toHaveLength(5);
		for (const week of report.weeks) expect(week.days).toHaveLength(7);
		expect(
			report.weeks.flatMap((week) => week.days).filter((day) => day.inMonth),
		).toHaveLength(31);
		expect(report.weeks[0]?.days[0]?.date).toBe("2026-09-27");
	});

	it("orders school events before bookings in each day", () => {
		const day = report.weeks
			.flatMap((week) => week.days)
			.find((entry) => entry.date === "2026-10-05");

		expect(day?.items.map((item) => item.kind)).toEqual(["event", "booking"]);
		expect(day?.items[0]?.timeLabel).toBe("All day");
	});

	it("builds an agenda from in-month items only", () => {
		expect(report.rows).toHaveLength(3);
		expect(report.rows.map((row) => row.date)).toEqual([
			"2026-10-05",
			"2026-10-05",
			"2026-10-06",
		]);
		expect(report.rows[0]?.statusLabel).toBe("Blocked");
		expect(report.rows[1]?.reference).toBe("BK-000000000001");
	});

	it("summarizes the visible month", () => {
		expect(report.summary).toEqual({
			bookings: 2,
			events: 1,
			datesInUse: 2,
			attendees: 150,
		});
		expect(report.monthLabel).toBe("October 2026");
		expect(report.fileName).toBe("calendar-report_2026-10.pdf");
	});

	it("uses six weeks for months that span six calendar rows", () => {
		const august = buildCalendarReport({
			month: "2026-08-01",
			bookings: [],
			events: [],
		});
		expect(august.weeks).toHaveLength(6);
	});
});

describe("paginateCalendarRows", () => {
	const rows = Array.from({ length: 70 }, (_, index) => ({
		date: "2026-10-01",
		dateLabel: "Thu, Oct 1",
		timeLabel: "09:00 – 10:00",
		kindLabel: "Booking",
		title: `Activity ${index + 1}`,
		venueName: "Main hall",
		statusLabel: "Approved",
		reference: `BK-${index}`,
	}));

	it("splits schedules using the first and continuation sizes", () => {
		const pages = paginateCalendarRows(rows);
		expect(pages[0]).toHaveLength(CALENDAR_FIRST_SCHEDULE_ROWS);
		expect(pages[1]).toHaveLength(CALENDAR_CONTINUATION_ROWS);
		expect(pages[2]).toHaveLength(70 - 60);
	});

	it("returns no pages for an empty schedule", () => {
		expect(paginateCalendarRows([])).toEqual([]);
	});
});
