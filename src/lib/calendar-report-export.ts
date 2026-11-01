import { createElement } from "react";
import type { CalendarReport } from "./calendar-report";
import { downloadBlob } from "./download";

export async function exportCalendarReport(report: CalendarReport) {
	const [{ pdf }, { CalendarReportDocument }] = await Promise.all([
		import("@react-pdf/renderer"),
		import("#/components/calendar-report-pdf"),
	]);

	const document = createElement(CalendarReportDocument, {
		report,
	}) as unknown as Parameters<typeof pdf>[0];
	const blob = await pdf(document).toBlob();
	downloadBlob(blob, report.fileName);
}
