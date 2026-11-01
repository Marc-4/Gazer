import { createElement } from "react";
import {
	type BookingReport,
	buildReportCsv,
	REPORT_BRAND,
	REPORT_COLUMNS,
	REPORT_TITLE,
	type ReportFormat,
	reportExcelNumberFormat,
	reportExcelValue,
	reportFileName,
	STATUS_ORDER,
} from "./booking-report";
import { downloadBlob } from "./download";
import { bookingStatusLabel } from "./format";

type XlsxModule = typeof import("@e965/xlsx");

export async function exportBookingReport(
	report: BookingReport,
	format: ReportFormat,
) {
	if (format === "csv") {
		// The BOM keeps Excel from mangling accented characters in UTF-8 CSV files.
		const blob = new Blob(["\uFEFF", buildReportCsv(report)], {
			type: "text/csv;charset=utf-8;",
		});
		downloadBlob(blob, reportFileName(report, "csv"));
		return;
	}

	if (format === "xlsx") {
		await exportXlsx(report);
		return;
	}

	await exportPdf(report);
}

function buildBookingsSheet(XLSX: XlsxModule, report: BookingReport) {
	const infoRows = [
		[REPORT_TITLE],
		[
			`Period: ${report.periodLabel}   |   Venues: ${report.venueLabel}   |   Statuses: ${report.statusLabel}`,
		],
		[
			`Generated: ${report.generatedLabel}   |   Bookings: ${report.summary.total}   |   Attendees: ${report.summary.attendees.toLocaleString("en-US")}`,
		],
		[],
	];
	const headerRowIndex = infoRows.length;
	const header = REPORT_COLUMNS.map((column) => column.label);
	const rows = report.rows.map((row) =>
		REPORT_COLUMNS.map((column) => reportExcelValue(column, row)),
	);
	const sheet = XLSX.utils.aoa_to_sheet([...infoRows, header, ...rows], {
		cellDates: true,
	});

	const lastColumn = REPORT_COLUMNS.length - 1;
	const lastRowIndex = headerRowIndex + rows.length;

	sheet["!merges"] = [0, 1, 2].map((index) => ({
		s: { r: index, c: 0 },
		e: { r: index, c: lastColumn },
	}));
	sheet["!cols"] = REPORT_COLUMNS.map((column) => ({ wch: column.xlsxWidth }));
	sheet["!rows"] = [
		{ hpt: 26 },
		{ hpt: 15 },
		{ hpt: 15 },
		{ hpt: 6 },
		{ hpt: 22 },
	];
	sheet["!autofilter"] = {
		ref: `A${headerRowIndex + 1}:${XLSX.utils.encode_col(
			lastColumn,
		)}${lastRowIndex + 1}`,
	};
	sheet["!margins"] = {
		left: 0.4,
		right: 0.4,
		top: 0.5,
		bottom: 0.5,
		header: 0.2,
		footer: 0.2,
	};

	rows.forEach((_, rowIndex) => {
		REPORT_COLUMNS.forEach((column, columnIndex) => {
			const format = reportExcelNumberFormat(column);
			if (!format) return;
			const cell =
				sheet[
					XLSX.utils.encode_cell({
						r: headerRowIndex + 1 + rowIndex,
						c: columnIndex,
					})
				];
			if (cell) cell.z = format;
		});
	});

	return sheet;
}

function buildSummarySheet(XLSX: XlsxModule, report: BookingReport) {
	const statusRows = STATUS_ORDER.map((status) => [
		bookingStatusLabel[status],
		report.summary[status],
		report.summary.total > 0
			? report.summary[status] / report.summary.total
			: 0,
	]);
	const venueRows = report.byVenue.map((venue) => [
		venue.venueName,
		venue.bookings,
		venue.approved,
		venue.attendees,
	]);

	const metaRows: Array<[string, string | number]> = [
		["Period", report.periodLabel],
		["Venues", report.venueLabel],
		["Statuses", report.statusLabel],
		["Generated", report.generatedLabel],
		["Total bookings", report.summary.total],
		["Total attendees", report.summary.attendees],
		["Venues represented", report.summary.venueCount],
	];

	const statusHeaderIndex = metaRows.length + 2;
	const statusFirstIndex = statusHeaderIndex + 1;
	const venueHeaderIndex = statusFirstIndex + statusRows.length + 1;
	const venueFirstIndex = venueHeaderIndex + 1;

	const data = [
		["Report summary"],
		...metaRows,
		[],
		["Status", "Bookings", "Share"],
		...statusRows,
		[],
		["Venue", "Bookings", "Approved", "Attendees"],
		...venueRows,
	];

	const sheet = XLSX.utils.aoa_to_sheet(data, { cellDates: true });

	sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
	sheet["!cols"] = [{ wch: 26 }, { wch: 20 }, { wch: 12 }, { wch: 12 }];
	sheet["!rows"] = [{ hpt: 26 }];

	const setFormat = (row: number, column: number, format: string) => {
		const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
		if (cell) cell.z = format;
	};

	// Total bookings, attendees, and venues represented.
	for (let index = 4; index <= 6; index += 1) {
		setFormat(index + 1, 1, "#,##0");
	}
	for (let index = 0; index < statusRows.length; index += 1) {
		setFormat(statusFirstIndex + index, 1, "#,##0");
		setFormat(statusFirstIndex + index, 2, "0.0%");
	}
	for (let index = 0; index < venueRows.length; index += 1) {
		for (let column = 1; column <= 3; column += 1) {
			setFormat(venueFirstIndex + index, column, "#,##0");
		}
	}

	return sheet;
}

async function exportXlsx(report: BookingReport) {
	const XLSX = await import("@e965/xlsx");
	const workbook = XLSX.utils.book_new();

	XLSX.utils.book_append_sheet(
		workbook,
		buildBookingsSheet(XLSX, report),
		"Bookings",
	);
	XLSX.utils.book_append_sheet(
		workbook,
		buildSummarySheet(XLSX, report),
		"Summary",
	);

	workbook.Props = {
		Title: `${REPORT_TITLE} · ${report.periodLabel}`,
		Subject: `${report.periodLabel} · ${report.venueLabel} · ${report.statusLabel}`,
		Author: REPORT_BRAND,
		Company: REPORT_BRAND,
		Comments: `Generated ${report.generatedLabel}`,
		CreatedDate: new Date(report.generatedAt),
	};

	const output = XLSX.write(workbook, {
		bookType: "xlsx",
		type: "array",
		compression: true,
		cellDates: true,
	}) as ArrayBuffer;

	downloadBlob(
		new Blob([output], {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		}),
		reportFileName(report, "xlsx"),
	);
}

async function exportPdf(report: BookingReport) {
	const [{ pdf }, { BookingReportDocument }] = await Promise.all([
		import("@react-pdf/renderer"),
		import("#/components/booking-report-pdf"),
	]);

	const document = createElement(BookingReportDocument, {
		report,
	}) as unknown as Parameters<typeof pdf>[0];
	const blob = await pdf(document).toBlob();
	downloadBlob(blob, reportFileName(report, "pdf"));
}
