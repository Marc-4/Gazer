import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import {
	bookingStatusLabel,
	formatDate,
	formatDateTime,
	formatTimeRange,
	toLocalDate,
} from "./format";
import type { BookingStatus } from "./types";

export const REPORT_BRAND = "NBSC Activity Booking System";
export const REPORT_TITLE = "Booking report";

const ALL_STATUSES: BookingStatus[] = [
	"pending",
	"approved",
	"rejected",
	"cancelled",
];

/**
 * Row shape returned by `bookings_search` for report exports. Only the columns
 * the report needs are selected, so this is intentionally narrower than
 * `BookingWithVenue`.
 */
export interface BookingReportRow {
	reference: string;
	status: BookingStatus;
	booking_date: string;
	start_time: string | null;
	end_time: string | null;
	venue_id: string;
	venue_name: string | null;
	activity_name: string;
	organization_name: string | null;
	requester_name: string;
	requester_email: string;
	requester_phone: string | null;
	attendee_count: number | null;
	created_at: string;
	decision_note: string | null;
	is_auto_approved: boolean;
}

/** Empty `from`/`to` mean "unbounded"; empty `venueIds` means "all venues". */
export interface BookingReportFilters {
	from: string;
	to: string;
	venueIds: string[];
	statuses: BookingStatus[];
}

export type ReportFormat = "csv" | "xlsx" | "pdf";

export type ReportPeriodPreset =
	| "all"
	| "last-30-days"
	| "next-30-days"
	| "this-month"
	| "last-month"
	| "custom";

export interface ReportPeriod {
	from: string;
	to: string;
}

export const REPORT_FORMAT_LABELS: Record<ReportFormat, string> = {
	csv: "CSV",
	xlsx: "Excel",
	pdf: "PDF",
};

export const REPORT_FORMAT_EXTENSIONS: Record<ReportFormat, string> = {
	csv: "csv",
	xlsx: "xlsx",
	pdf: "pdf",
};

export const STATUS_ORDER = ALL_STATUSES;

export function isoDate(value: Date) {
	return format(value, "yyyy-MM-dd");
}

export function resolvePeriodPreset(
	preset: ReportPeriodPreset,
	today = new Date(),
): ReportPeriod {
	switch (preset) {
		case "all":
			return { from: "", to: "" };
		case "last-30-days": {
			const end = new Date(today);
			const start = new Date(today);
			start.setDate(start.getDate() - 29);
			return { from: isoDate(start), to: isoDate(end) };
		}
		case "next-30-days": {
			const start = new Date(today);
			const end = new Date(today);
			end.setDate(end.getDate() + 30);
			return { from: isoDate(start), to: isoDate(end) };
		}
		case "this-month":
			return {
				from: isoDate(startOfMonth(today)),
				to: isoDate(endOfMonth(today)),
			};
		case "last-month": {
			const previous = subMonths(today, 1);
			return {
				from: isoDate(startOfMonth(previous)),
				to: isoDate(endOfMonth(previous)),
			};
		}
		case "custom":
			return { from: "", to: "" };
	}
}

function formatShortDate(value: string) {
	return format(toLocalDate(value), "MMM d, yyyy");
}

function formatDayAndMonth(value: string) {
	return format(toLocalDate(value), "MMM d");
}

export function formatPeriodLabel(from: string, to: string) {
	if (!from && !to) return "All dates";
	if (from && !to) return `From ${formatShortDate(from)}`;
	if (!from && to) return `Through ${formatShortDate(to)}`;
	if (from === to) return formatShortDate(from);

	const fromDate = toLocalDate(from);
	const toDate = toLocalDate(to);
	if (fromDate.getFullYear() === toDate.getFullYear()) {
		return `${formatDayAndMonth(from)} – ${formatShortDate(to)}`;
	}
	return `${formatShortDate(from)} – ${formatShortDate(to)}`;
}

export function formatStatusLabel(statuses: BookingStatus[]) {
	if (statuses.length === 0 || statuses.length === ALL_STATUSES.length) {
		return "All statuses";
	}
	return STATUS_ORDER.filter((status) => statuses.includes(status))
		.map((status) => bookingStatusLabel[status])
		.join(", ");
}

export function formatVenueLabel(
	venueIds: string[],
	venueNames: Record<string, string> = {},
) {
	if (venueIds.length === 0) return "All venues";
	if (venueIds.length === 1) {
		return venueNames[venueIds[0]] ?? "1 venue";
	}
	return `${venueIds.length} venues`;
}

export function normalizeFilters(
	filters: BookingReportFilters,
): BookingReportFilters {
	const from = filters.from || "";
	const to = filters.to || "";
	return {
		from: to && from && from > to ? to : from,
		to: from && to && from > to ? from : to,
		venueIds: Array.from(new Set(filters.venueIds)).sort(),
		statuses: STATUS_ORDER.filter((status) =>
			filters.statuses.includes(status),
		),
	};
}

export function isPeriodValid(filters: BookingReportFilters) {
	return (
		!filters.from ||
		!filters.to ||
		(!Number.isNaN(toLocalDate(filters.from).getTime()) &&
			!Number.isNaN(toLocalDate(filters.to).getTime()) &&
			filters.from <= filters.to)
	);
}

export type ReportColumnKind = "text" | "isoDate" | "dateTime" | "number";

export interface ReportColumn {
	key: string;
	label: string;
	kind: ReportColumnKind;
	align: "left" | "center" | "right";
	/** Width in Excel character units. */
	xlsxWidth: number;
	/** Percentage of the PDF table width; `0` hides the column from the PDF. */
	pdfWidth: number;
	/** Conservative character budget for the single-line PDF cell. */
	pdfMaxChars: number;
	getValue: (row: BookingReportRow) => string | number | null;
}

export const REPORT_COLUMNS: ReportColumn[] = [
	{
		key: "reference",
		label: "Reference",
		kind: "text",
		align: "left",
		xlsxWidth: 17,
		pdfWidth: 8,
		pdfMaxChars: 18,
		getValue: (row) => row.reference,
	},
	{
		key: "status",
		label: "Status",
		kind: "text",
		align: "left",
		xlsxWidth: 12,
		pdfWidth: 7,
		pdfMaxChars: 11,
		getValue: (row) => bookingStatusLabel[row.status],
	},
	{
		key: "booking_date",
		label: "Booking date",
		kind: "isoDate",
		align: "left",
		xlsxWidth: 14,
		pdfWidth: 10,
		pdfMaxChars: 18,
		getValue: (row) => row.booking_date,
	},
	{
		key: "time",
		label: "Time",
		kind: "text",
		align: "left",
		xlsxWidth: 21,
		pdfWidth: 11,
		pdfMaxChars: 20,
		getValue: (row) => formatTimeRange(row.start_time, row.end_time),
	},
	{
		key: "venue",
		label: "Venue",
		kind: "text",
		align: "left",
		xlsxWidth: 26,
		pdfWidth: 14,
		pdfMaxChars: 27,
		getValue: (row) => row.venue_name ?? "Unknown",
	},
	{
		key: "activity",
		label: "Activity",
		kind: "text",
		align: "left",
		xlsxWidth: 34,
		pdfWidth: 20,
		pdfMaxChars: 40,
		getValue: (row) => row.activity_name,
	},
	{
		key: "requester",
		label: "Requester",
		kind: "text",
		align: "left",
		xlsxWidth: 24,
		pdfWidth: 12,
		pdfMaxChars: 24,
		getValue: (row) => row.requester_name,
	},
	{
		key: "organization",
		label: "Organization",
		kind: "text",
		align: "left",
		xlsxWidth: 24,
		pdfWidth: 10,
		pdfMaxChars: 20,
		getValue: (row) => row.organization_name ?? "",
	},
	{
		key: "attendees",
		label: "Attendees",
		kind: "number",
		align: "right",
		xlsxWidth: 11,
		pdfWidth: 8,
		pdfMaxChars: 6,
		getValue: (row) => row.attendee_count,
	},
	{
		key: "email",
		label: "Email",
		kind: "text",
		align: "left",
		xlsxWidth: 32,
		pdfWidth: 0,
		pdfMaxChars: 0,
		getValue: (row) => row.requester_email,
	},
	{
		key: "phone",
		label: "Phone",
		kind: "text",
		align: "left",
		xlsxWidth: 18,
		pdfWidth: 0,
		pdfMaxChars: 0,
		getValue: (row) => row.requester_phone ?? "",
	},
	{
		key: "requested",
		label: "Requested on",
		kind: "dateTime",
		align: "left",
		xlsxWidth: 18,
		pdfWidth: 0,
		pdfMaxChars: 0,
		getValue: (row) => row.created_at,
	},
	{
		key: "note",
		label: "Decision note",
		kind: "text",
		align: "left",
		xlsxWidth: 40,
		pdfWidth: 0,
		pdfMaxChars: 0,
		getValue: (row) => row.decision_note ?? "",
	},
];

export const PDF_COLUMNS = REPORT_COLUMNS.filter(
	(column) => column.pdfWidth > 0,
);

function dateParts(value: string) {
	const date = toLocalDate(value);
	return {
		year: date.getFullYear(),
		month: date.getMonth(),
		day: date.getDate(),
	};
}

/** Excel-friendly value: real dates/numbers so the sheet is filterable and sortable. */
export function reportExcelValue(
	column: ReportColumn,
	row: BookingReportRow,
): string | number | Date | null {
	const value = column.getValue(row);
	if (value === null || value === "") return null;
	if (column.kind === "isoDate" && typeof value === "string") {
		const { year, month, day } = dateParts(value);
		return new Date(year, month, day);
	}
	if (column.kind === "dateTime" && typeof value === "string") {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	return value;
}

export function reportExcelNumberFormat(column: ReportColumn) {
	switch (column.kind) {
		case "isoDate":
			return "yyyy-mm-dd";
		case "dateTime":
			return "yyyy-mm-dd hh:mm";
		case "number":
			return "#,##0";
		default:
			return undefined;
	}
}

function pad(value: number) {
	return String(value).padStart(2, "0");
}

/** Plain-text value used for CSV cells. ISO dates keep the file sortable. */
export function reportCsvValue(column: ReportColumn, row: BookingReportRow) {
	const value = column.getValue(row);
	if (value === null) return "";
	if (column.kind === "dateTime" && typeof value === "string") {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return "";
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
			date.getDate(),
		)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
	}
	return String(value);
}

/** Human-friendly value used inside the PDF table. */
export function reportPdfValue(column: ReportColumn, row: BookingReportRow) {
	const value = column.getValue(row);
	if (value === null || value === "") return "—";
	if (column.kind === "isoDate" && typeof value === "string") {
		return formatDate(value);
	}
	if (column.kind === "dateTime" && typeof value === "string") {
		return formatDateTime(value);
	}
	if (column.kind === "number" && typeof value === "number") {
		return value.toLocaleString("en-US");
	}
	return String(value);
}

export function truncateText(value: string, maxChars: number) {
	if (maxChars <= 0 || value.length <= maxChars) return value;
	if (maxChars <= 3) return value.slice(0, maxChars);
	return `${value.slice(0, maxChars - 3).trimEnd()}...`;
}

// The PDF uses the built-in Helvetica family (WinAnsi encoding), so characters
// outside Latin-1 render as blanks. Keep the WinAnsi punctuation and drop the rest.
const PDF_SAFE_PUNCTUATION = "–—‘’“”…•·™®©°±×÷€";

export function sanitizePdfText(value: string) {
	let safe = "";
	for (const char of value) {
		const code = char.codePointAt(0) ?? 0;
		safe += code <= 0xff || PDF_SAFE_PUNCTUATION.includes(char) ? char : " ";
	}
	return safe.replace(/\s+/g, " ").trim();
}

export function escapeCsvField(value: string) {
	if (/[",\r\n]/.test(value) || /^\s|\s$/.test(value)) {
		return `"${value.replaceAll('"', '""')}"`;
	}
	return value;
}

export function buildReportCsv(report: BookingReport) {
	const header = REPORT_COLUMNS.map((column) =>
		escapeCsvField(column.label),
	).join(",");
	const lines = report.rows.map((row) =>
		REPORT_COLUMNS.map((column) =>
			escapeCsvField(reportCsvValue(column, row)),
		).join(","),
	);
	return [header, ...lines].join("\r\n");
}

export interface VenueSummaryRow {
	venueId: string;
	venueName: string;
	bookings: number;
	approved: number;
	attendees: number;
}

export interface BookingReport {
	filters: BookingReportFilters;
	periodLabel: string;
	venueLabel: string;
	statusLabel: string;
	generatedAt: string;
	generatedLabel: string;
	rows: BookingReportRow[];
	summary: {
		total: number;
		pending: number;
		approved: number;
		rejected: number;
		cancelled: number;
		attendees: number;
		venueCount: number;
	};
	byVenue: VenueSummaryRow[];
}

export function buildBookingReport({
	rows,
	filters,
	venueNames = {},
	generatedAt = new Date().toISOString(),
}: {
	rows: BookingReportRow[];
	filters: BookingReportFilters;
	venueNames?: Record<string, string>;
	generatedAt?: string;
}): BookingReport {
	const normalized = normalizeFilters(filters);
	const summary = {
		total: rows.length,
		pending: 0,
		approved: 0,
		rejected: 0,
		cancelled: 0,
		attendees: 0,
		venueCount: 0,
	};

	const venues = new Map<string, VenueSummaryRow>();
	for (const row of rows) {
		summary[row.status] += 1;
		summary.attendees += row.attendee_count ?? 0;

		const venue = venues.get(row.venue_id) ?? {
			venueId: row.venue_id,
			venueName: row.venue_name ?? "Unknown venue",
			bookings: 0,
			approved: 0,
			attendees: 0,
		};
		venue.bookings += 1;
		venue.attendees += row.attendee_count ?? 0;
		if (row.status === "approved") venue.approved += 1;
		venues.set(row.venue_id, venue);
	}
	summary.venueCount = venues.size;

	const byVenue = Array.from(venues.values()).sort(
		(a, b) => b.bookings - a.bookings || a.venueName.localeCompare(b.venueName),
	);

	return {
		filters: normalized,
		periodLabel: formatPeriodLabel(normalized.from, normalized.to),
		venueLabel: formatVenueLabel(normalized.venueIds, venueNames),
		statusLabel: formatStatusLabel(normalized.statuses),
		generatedAt,
		generatedLabel: formatDateTime(generatedAt),
		rows,
		summary,
		byVenue,
	};
}

export function reportFileName(report: BookingReport, format: ReportFormat) {
	const { from, to } = report.filters;
	const period =
		from && to
			? `${from}_to_${to}`
			: from
				? `from_${from}`
				: to
					? `through_${to}`
					: "all-dates";
	return `booking-report_${period}.${REPORT_FORMAT_EXTENSIONS[format]}`;
}

/**
 * Rows are fixed-height single-line cells, so pagination can be computed up
 * front. That keeps the summary block on the first page only while repeating
 * the table header on every page.
 */
export const PDF_FIRST_PAGE_ROWS = 21;
export const PDF_CONTINUATION_ROWS = 23;

export function paginateReportRows<T>(
	rows: T[],
	firstPageSize = PDF_FIRST_PAGE_ROWS,
	continuationSize = PDF_CONTINUATION_ROWS,
): T[][] {
	if (rows.length === 0) return [[]];
	if (rows.length <= firstPageSize) return [rows];

	const pages: T[][] = [rows.slice(0, firstPageSize)];
	for (
		let index = firstPageSize;
		index < rows.length;
		index += continuationSize
	) {
		pages.push(rows.slice(index, index + continuationSize));
	}
	return pages;
}
