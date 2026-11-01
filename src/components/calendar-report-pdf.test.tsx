import { pdf } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import {
	buildCalendarReport,
	type CalendarReport,
} from "#/lib/calendar-report";
import type { BookingWithVenue } from "#/lib/types";
import { CalendarReportDocument } from "./calendar-report-pdf";

function booking(index: number): BookingWithVenue {
	const day = String((index % 28) + 1).padStart(2, "0");
	return {
		id: `booking-${index}`,
		reference: `BK-${String(index).padStart(12, "0")}`,
		public_token: "00000000-0000-4000-8000-000000000001",
		user_id: null,
		venue_id: "venue-1",
		booking_date: `2026-10-${day}`,
		start_time: "09:00:00",
		end_time: "11:00:00",
		status: "approved",
		activity_name: `Activity ${index}`,
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
	};
}

function buildReport(count: number): CalendarReport {
	return buildCalendarReport({
		month: "2026-10-01",
		bookings: Array.from({ length: count }, (_, index) => booking(index + 1)),
		events: [],
		venueLabel: "All venues",
		statusLabel: "Active",
		generatedAt: "2026-10-31T17:00:00",
	});
}

async function render(report: CalendarReport) {
	const blob = await pdf(<CalendarReportDocument report={report} />).toBlob();
	const bytes = new Uint8Array(await blob.arrayBuffer());
	const text = new TextDecoder("latin1").decode(bytes);
	const pages = text.match(/\/Type\s*\/Page\b(?!s)/g) ?? [];
	return { blob, header: text.slice(0, 5), pageCount: pages.length };
}

describe("CalendarReportDocument", () => {
	it("renders a month grid plus a paginated schedule", async () => {
		const { blob, header, pageCount } = await render(buildReport(40));

		expect(header).toBe("%PDF-");
		expect(blob.type).toBe("application/pdf");
		expect(blob.size).toBeGreaterThan(3000);
		// Grid page + 28 rows on the first schedule page + 12 on the next.
		expect(pageCount).toBe(3);
	}, 60_000);

	it("renders only the grid when the month is empty", async () => {
		const { pageCount } = await render(buildReport(0));
		expect(pageCount).toBe(1);
	}, 60_000);
});
