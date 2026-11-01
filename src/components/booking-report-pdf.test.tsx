import { pdf } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import {
	type BookingReport,
	type BookingReportRow,
	buildBookingReport,
	STATUS_ORDER,
} from "#/lib/booking-report";
import { BookingReportDocument } from "./booking-report-pdf";

function row(index: number): BookingReportRow {
	return {
		reference: `BK-${String(index).padStart(12, "0")}`,
		status: "approved",
		booking_date: "2026-10-31",
		start_time: "09:00:00",
		end_time: "11:00:00",
		venue_id: "venue-1",
		venue_name: "Main hall",
		activity_name: "Science Fair",
		organization_name: "Science Club",
		requester_name: "Maria Santos",
		requester_email: "maria@example.com",
		requester_phone: null,
		attendee_count: 120,
		created_at: "2026-10-24T09:15:00",
		decision_note: null,
		is_auto_approved: false,
	};
}

function buildReport(count: number): BookingReport {
	return buildBookingReport({
		rows: Array.from({ length: count }, (_, index) => row(index + 1)),
		filters: {
			from: "2026-10-01",
			to: "2026-10-31",
			venueIds: [],
			statuses: [...STATUS_ORDER],
		},
		generatedAt: "2026-10-31T17:00:00",
	});
}

async function render(report: BookingReport) {
	const blob = await pdf(<BookingReportDocument report={report} />).toBlob();
	const bytes = new Uint8Array(await blob.arrayBuffer());
	const text = new TextDecoder("latin1").decode(bytes);
	const pages = text.match(/\/Type\s*\/Page\b(?!s)/g) ?? [];
	return { blob, header: text.slice(0, 5), pageCount: pages.length };
}

describe("BookingReportDocument", () => {
	it("renders a paginated PDF with the report header", async () => {
		const { blob, header, pageCount } = await render(buildReport(30));

		expect(header).toBe("%PDF-");
		expect(blob.type).toBe("application/pdf");
		expect(blob.size).toBeGreaterThan(3000);
		// 21 rows on the first page, 23 on each continuation page.
		expect(pageCount).toBe(2);
	}, 60_000);

	it("renders a single page when there are no bookings", async () => {
		const { pageCount } = await render(buildReport(0));
		expect(pageCount).toBe(1);
	}, 60_000);
});
