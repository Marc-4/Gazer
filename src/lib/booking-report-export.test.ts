import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type BookingReport,
	type BookingReportRow,
	buildBookingReport,
	REPORT_COLUMNS,
	STATUS_ORDER,
} from "./booking-report";
import { exportBookingReport } from "./booking-report-export";

const clicked: HTMLAnchorElement[] = [];

function row(overrides: Partial<BookingReportRow> = {}): BookingReportRow {
	return {
		reference: "BK-000000000001",
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
		requester_phone: "0917 000 0000",
		attendee_count: 120,
		created_at: "2026-10-24T09:15:00",
		decision_note: "Approved by the registrar",
		is_auto_approved: false,
		...overrides,
	};
}

function buildReport(rows: BookingReportRow[]): BookingReport {
	return buildBookingReport({
		rows,
		filters: {
			from: "2026-10-01",
			to: "2026-10-31",
			venueIds: [],
			statuses: [...STATUS_ORDER],
		},
		generatedAt: "2026-10-31T17:00:00",
	});
}

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
	clicked.length = 0;
	createObjectURL = vi.fn(() => "blob:report");
	revokeObjectURL = vi.fn();
	vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
	vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
		this: HTMLAnchorElement,
	) {
		clicked.push(this);
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

async function exportedBlob() {
	expect(createObjectURL).toHaveBeenCalledTimes(1);
	return createObjectURL.mock.calls[0][0] as Blob;
}

describe("csv export", () => {
	it("downloads a UTF-8 CSV with a BOM and the report period in its name", async () => {
		await exportBookingReport(buildReport([row()]), "csv");

		const blob = await exportedBlob();
		expect(blob.type).toBe("text/csv;charset=utf-8;");
		expect(clicked[0]?.download).toBe(
			"booking-report_2026-10-01_to_2026-10-31.csv",
		);

		const bytes = new Uint8Array(await blob.arrayBuffer());
		expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
		const text = await blob.text();
		const lines = text.split("\r\n");
		expect(lines[0]).toBe(
			REPORT_COLUMNS.map((column) => column.label).join(","),
		);
		expect(lines[1]).toContain(
			"BK-000000000001,Approved,2026-10-31,9:00 AM – 11:00 AM,Main hall,Science Fair",
		);
	});
});

describe("xlsx export", () => {
	it("writes a bookings sheet, a summary sheet, and printable metadata", async () => {
		await exportBookingReport(
			buildReport([
				row(),
				row({ reference: "BK-000000000002", status: "pending" }),
			]),
			"xlsx",
		);

		const blob = await exportedBlob();
		expect(blob.type).toBe(
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		);
		expect(clicked[0]?.download).toBe(
			"booking-report_2026-10-01_to_2026-10-31.xlsx",
		);

		const XLSX = await import("@e965/xlsx");
		const workbook = XLSX.read(new Uint8Array(await blob.arrayBuffer()), {
			type: "array",
			cellDates: true,
			cellStyles: true,
		});

		expect(workbook.SheetNames).toEqual(["Bookings", "Summary"]);
		expect(workbook.Props?.Title).toContain("Booking report");

		const bookings = workbook.Sheets.Bookings;
		const table = XLSX.utils.sheet_to_json<unknown[]>(bookings, {
			header: 1,
			raw: true,
		});

		expect(table[0]?.[0]).toBe("Booking report");
		expect(table[1]?.[0]).toContain("Oct 1 – Oct 31, 2026");
		expect(table[4]).toEqual(REPORT_COLUMNS.map((column) => column.label));
		expect(table[5]?.[0]).toBe("BK-000000000001");
		expect(table[5]?.[2]).toBeInstanceOf(Date);
		expect(table[5]?.[8] as number).toBe(120);
		expect(bookings["!autofilter"]?.ref).toBe("A5:M7");
		expect(bookings["!cols"]).toHaveLength(REPORT_COLUMNS.length);
		expect(bookings["!merges"]).toHaveLength(3);

		const summary = XLSX.utils.sheet_to_json<unknown[]>(
			workbook.Sheets.Summary,
			{ header: 1, raw: true },
		);
		expect(summary[0]?.[0]).toBe("Report summary");
		expect(summary[5]).toEqual(["Total bookings", 2]);
		expect(summary[6]).toEqual(["Total attendees", 240]);
	});
});
