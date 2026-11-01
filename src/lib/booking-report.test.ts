import { describe, expect, it } from "vitest";
import {
	type BookingReportRow,
	buildBookingReport,
	buildReportCsv,
	formatPeriodLabel,
	formatStatusLabel,
	formatVenueLabel,
	isPeriodValid,
	normalizeFilters,
	paginateReportRows,
	REPORT_COLUMNS,
	reportCsvValue,
	reportExcelValue,
	reportFileName,
	resolvePeriodPreset,
	STATUS_ORDER,
	sanitizePdfText,
	truncateText,
} from "./booking-report";

const reference = REPORT_COLUMNS.find((column) => column.key === "reference");
const bookingDate = REPORT_COLUMNS.find(
	(column) => column.key === "booking_date",
);
const requested = REPORT_COLUMNS.find((column) => column.key === "requested");
const attendees = REPORT_COLUMNS.find((column) => column.key === "attendees");

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
		decision_note: null,
		is_auto_approved: false,
		...overrides,
	};
}

describe("resolvePeriodPreset", () => {
	const today = new Date(2026, 9, 31, 15, 0, 0);

	it("returns an unbounded range for all dates", () => {
		expect(resolvePeriodPreset("all", today)).toEqual({ from: "", to: "" });
	});

	it("computes the current month", () => {
		expect(resolvePeriodPreset("this-month", today)).toEqual({
			from: "2026-10-01",
			to: "2026-10-31",
		});
	});

	it("computes the previous month across a year boundary", () => {
		expect(resolvePeriodPreset("last-month", new Date(2026, 0, 10))).toEqual({
			from: "2025-12-01",
			to: "2025-12-31",
		});
	});

	it("computes the next 30 days inclusively", () => {
		expect(resolvePeriodPreset("next-30-days", today)).toEqual({
			from: "2026-10-31",
			to: "2026-11-30",
		});
	});

	it("computes the last 30 days inclusively", () => {
		expect(resolvePeriodPreset("last-30-days", today)).toEqual({
			from: "2026-10-02",
			to: "2026-10-31",
		});
	});
});

describe("formatPeriodLabel", () => {
	it("describes an unbounded range", () => {
		expect(formatPeriodLabel("", "")).toBe("All dates");
	});

	it("collapses a single day", () => {
		expect(formatPeriodLabel("2026-10-31", "2026-10-31")).toBe("Oct 31, 2026");
	});

	it("omits the repeated year inside one year", () => {
		expect(formatPeriodLabel("2026-10-01", "2026-10-31")).toBe(
			"Oct 1 – Oct 31, 2026",
		);
	});

	it("keeps both years across a year boundary", () => {
		expect(formatPeriodLabel("2025-12-15", "2026-01-14")).toBe(
			"Dec 15, 2025 – Jan 14, 2026",
		);
	});

	it("supports open-ended ranges", () => {
		expect(formatPeriodLabel("2026-10-01", "")).toBe("From Oct 1, 2026");
		expect(formatPeriodLabel("", "2026-10-31")).toBe("Through Oct 31, 2026");
	});
});

describe("filter labels", () => {
	it("labels all statuses and named subsets", () => {
		expect(formatStatusLabel([])).toBe("All statuses");
		expect(formatStatusLabel([...STATUS_ORDER])).toBe("All statuses");
		expect(formatStatusLabel(["approved", "pending"])).toBe(
			"Pending, Approved",
		);
	});

	it("labels venue selections", () => {
		expect(formatVenueLabel([])).toBe("All venues");
		expect(formatVenueLabel(["v1"], { v1: "Main hall" })).toBe("Main hall");
		expect(formatVenueLabel(["v1", "v2"], { v1: "Main hall" })).toBe(
			"2 venues",
		);
	});
});

describe("normalizeFilters", () => {
	it("dedupes venues and orders dates chronologically", () => {
		expect(
			normalizeFilters({
				from: "2026-10-31",
				to: "2026-10-01",
				venueIds: ["v2", "v1", "v2"],
				statuses: ["approved", "pending", "approved"],
			}),
		).toEqual({
			from: "2026-10-01",
			to: "2026-10-31",
			venueIds: ["v1", "v2"],
			statuses: ["pending", "approved"],
		});
	});

	it("rejects reversed ranges when validating user input", () => {
		expect(
			isPeriodValid({
				from: "2026-10-31",
				to: "2026-10-01",
				venueIds: [],
				statuses: [],
			}),
		).toBe(false);
		expect(
			isPeriodValid({ from: "", to: "2026-10-01", venueIds: [], statuses: [] }),
		).toBe(true);
	});
});

describe("buildBookingReport", () => {
	const rows = [
		row(),
		row({
			reference: "BK-000000000002",
			status: "pending",
			attendee_count: null,
		}),
		row({
			reference: "BK-000000000003",
			status: "pending",
			venue_id: "venue-2",
			venue_name: "Gymnasium",
			attendee_count: 30,
		}),
		row({
			reference: "BK-000000000004",
			status: "cancelled",
			venue_id: "venue-2",
			venue_name: "Gymnasium",
		}),
	];

	const report = buildBookingReport({
		rows,
		filters: {
			from: "2026-10-01",
			to: "2026-10-31",
			venueIds: [],
			statuses: [...STATUS_ORDER],
		},
		generatedAt: "2026-10-31T17:00:00",
	});

	it("counts every status and sums attendees", () => {
		expect(report.summary).toEqual({
			total: 4,
			pending: 2,
			approved: 1,
			rejected: 0,
			cancelled: 1,
			attendees: 270,
			venueCount: 2,
		});
	});

	it("groups venues by booking volume", () => {
		expect(report.byVenue).toEqual([
			{
				venueId: "venue-2",
				venueName: "Gymnasium",
				bookings: 2,
				approved: 0,
				attendees: 150,
			},
			{
				venueId: "venue-1",
				venueName: "Main hall",
				bookings: 2,
				approved: 1,
				attendees: 120,
			},
		]);
	});

	it("describes the applied filters", () => {
		expect(report.periodLabel).toBe("Oct 1 – Oct 31, 2026");
		expect(report.venueLabel).toBe("All venues");
		expect(report.statusLabel).toBe("All statuses");
	});
});

describe("buildReportCsv", () => {
	it("writes a header row and one line per booking", () => {
		const report = buildBookingReport({
			rows: [row()],
			filters: { from: "", to: "", venueIds: [], statuses: [...STATUS_ORDER] },
			generatedAt: "2026-10-31T17:00:00",
		});

		const csv = buildReportCsv(report);
		const lines = csv.split("\r\n");

		expect(lines).toHaveLength(2);
		expect(lines[0]).toBe(
			REPORT_COLUMNS.map((column) => column.label).join(","),
		);
		expect(lines[1]).toContain("BK-000000000001,Approved,2026-10-31,");
	});

	it("quotes fields containing commas, quotes, and newlines", () => {
		const report = buildBookingReport({
			rows: [
				row({
					activity_name: 'Fair, "big" day',
					organization_name: "Line one\nLine two",
				}),
			],
			filters: { from: "", to: "", venueIds: [], statuses: [...STATUS_ORDER] },
			generatedAt: "2026-10-31T17:00:00",
		});

		const csv = buildReportCsv(report);
		expect(csv).toContain('"Fair, ""big"" day"');
		expect(csv).toContain('"Line one\nLine two"');
	});
});

describe("column formatting", () => {
	it("keeps ISO dates in CSV and friendly dates in PDF", () => {
		expect(bookingDate).toBeDefined();
		if (!bookingDate) return;
		expect(reportCsvValue(bookingDate, row())).toBe("2026-10-31");
	});

	it("converts dates to local Date objects for Excel", () => {
		if (!bookingDate) return;
		const value = reportExcelValue(bookingDate, row());
		expect(value).toBeInstanceOf(Date);
		if (value instanceof Date) {
			expect(value.getFullYear()).toBe(2026);
			expect(value.getMonth()).toBe(9);
			expect(value.getDate()).toBe(31);
		}
	});

	it("formats timestamps as sortable CSV text", () => {
		if (!requested) return;
		expect(reportCsvValue(requested, row())).toBe("2026-10-24 09:15");
	});

	it("keeps empty numbers blank in CSV", () => {
		if (!attendees) return;
		expect(reportCsvValue(attendees, row({ attendee_count: null }))).toBe("");
		expect(reportCsvValue(attendees, row())).toBe("120");
	});
});

describe("text helpers", () => {
	it("truncates long values with an ellipsis", () => {
		expect(truncateText("Science Fair", 20)).toBe("Science Fair");
		expect(truncateText("Science Fair 2026", 12)).toBe("Science F...");
	});

	it("drops characters the built-in PDF font cannot encode", () => {
		expect(sanitizePdfText("Science 🧪 Fair")).toBe("Science Fair");
		expect(sanitizePdfText("9:00 – 11:00")).toBe("9:00 – 11:00");
	});
});

describe("reportFileName", () => {
	it("embeds the exported period", () => {
		const report = buildBookingReport({
			rows: [],
			filters: {
				from: "2026-10-01",
				to: "2026-10-31",
				venueIds: [],
				statuses: [...STATUS_ORDER],
			},
			generatedAt: "2026-10-31T17:00:00",
		});

		expect(reportFileName(report, "csv")).toBe(
			"booking-report_2026-10-01_to_2026-10-31.csv",
		);
		expect(reportFileName(report, "xlsx")).toBe(
			"booking-report_2026-10-01_to_2026-10-31.xlsx",
		);
		expect(reportFileName(report, "pdf")).toBe(
			"booking-report_2026-10-01_to_2026-10-31.pdf",
		);
	});

	it("falls back to all dates", () => {
		const report = buildBookingReport({
			rows: [],
			filters: { from: "", to: "", venueIds: [], statuses: [...STATUS_ORDER] },
			generatedAt: "2026-10-31T17:00:00",
		});
		expect(reportFileName(report, "pdf")).toBe("booking-report_all-dates.pdf");
	});
});

describe("paginateReportRows", () => {
	it("always returns at least one page", () => {
		expect(paginateReportRows([], 3, 5)).toEqual([[]]);
	});

	it("uses a smaller first page and full continuation pages", () => {
		const rows = Array.from({ length: 10 }, (_, index) => index);
		const pages = paginateReportRows(rows, 4, 3);
		expect(pages.map((page) => page.length)).toEqual([4, 3, 3]);
		expect(pages.flat()).toEqual(rows);
	});

	it("keeps a single page when everything fits", () => {
		expect(paginateReportRows([1, 2, 3], 4, 3)).toEqual([[1, 2, 3]]);
	});
});

describe("reference column", () => {
	it("is exported verbatim", () => {
		if (!reference) return;
		expect(reportCsvValue(reference, row())).toBe("BK-000000000001");
	});
});
