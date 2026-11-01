import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
	type BookingReport,
	PDF_COLUMNS,
	paginateReportRows,
	REPORT_BRAND,
	REPORT_TITLE,
	reportPdfValue,
	sanitizePdfText,
	truncateText,
} from "#/lib/booking-report";
import type { BookingStatus } from "#/lib/types";

const STATUS_COLORS: Record<BookingStatus, { dot: string; text: string }> = {
	approved: { dot: "#16a34a", text: "#15803d" },
	pending: { dot: "#d97706", text: "#b45309" },
	rejected: { dot: "#dc2626", text: "#b91c1c" },
	cancelled: { dot: "#6b7280", text: "#4b5563" },
};

const colors = {
	navy: "#0b1f3a",
	blue: "#2451d8",
	gold: "#f0c75e",
	text: "#25303f",
	muted: "#6b7280",
	border: "#dbe2ee",
	rowBorder: "#e6ebf4",
	stripe: "#f6f8fc",
	panel: "#f7f9fd",
};

const styles = StyleSheet.create({
	page: {
		paddingTop: 24,
		paddingBottom: 42,
		paddingHorizontal: 28,
		fontFamily: "Helvetica",
		fontSize: 8,
		color: colors.text,
		backgroundColor: "#ffffff",
	},
	brandRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	brand: {
		fontFamily: "Helvetica-Bold",
		fontSize: 7,
		letterSpacing: 1.3,
		textTransform: "uppercase",
		color: colors.blue,
	},
	generated: { fontSize: 7, color: colors.muted },
	titleRow: {
		flexDirection: "row",
		alignItems: "flex-end",
		justifyContent: "space-between",
		marginTop: 5,
	},
	title: {
		fontFamily: "Helvetica-Bold",
		fontSize: 19,
		color: colors.navy,
		letterSpacing: -0.2,
	},
	continued: { fontSize: 7.5, color: colors.muted, marginBottom: 2 },
	subtitle: { fontSize: 8, color: "#4b5563", marginTop: 3 },
	rule: { height: 2, width: 64, backgroundColor: colors.gold, marginTop: 8 },

	summary: {
		flexDirection: "row",
		marginTop: 12,
		borderWidth: 0.75,
		borderColor: colors.border,
		backgroundColor: colors.panel,
		borderRadius: 4,
	},
	summaryCell: {
		flex: 1,
		paddingVertical: 7,
		paddingHorizontal: 8,
		borderRightWidth: 0.75,
		borderRightColor: colors.border,
	},
	summaryCellLast: { borderRightWidth: 0 },
	summaryLabel: {
		fontFamily: "Helvetica-Bold",
		fontSize: 6.2,
		letterSpacing: 0.7,
		textTransform: "uppercase",
		color: colors.muted,
	},
	summaryValue: {
		fontFamily: "Helvetica-Bold",
		fontSize: 13,
		marginTop: 2,
	},

	table: { marginTop: 12 },
	tableHead: {
		flexDirection: "row",
		alignItems: "center",
		height: 20,
		backgroundColor: colors.navy,
		borderTopLeftRadius: 3,
		borderTopRightRadius: 3,
	},
	headCell: { paddingHorizontal: 5 },
	headText: {
		fontFamily: "Helvetica-Bold",
		fontSize: 6.3,
		letterSpacing: 0.6,
		textTransform: "uppercase",
		color: "#ffffff",
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		height: 18,
		borderBottomWidth: 0.5,
		borderBottomColor: colors.rowBorder,
	},
	rowAlt: { backgroundColor: colors.stripe },
	cell: { paddingHorizontal: 5 },
	cellText: { fontSize: 7.2, color: colors.text },
	cellTextRight: { textAlign: "right" },
	textRight: { textAlign: "right" },
	status: { flexDirection: "row", alignItems: "center" },
	statusDot: { width: 4, height: 4, borderRadius: 2, marginRight: 3 },
	statusText: { fontFamily: "Helvetica-Bold", fontSize: 7 },

	emptyRow: {
		height: 60,
		alignItems: "center",
		justifyContent: "center",
		borderBottomWidth: 0.5,
		borderBottomColor: colors.rowBorder,
	},
	emptyText: { fontSize: 8, color: colors.muted },

	footer: {
		position: "absolute",
		left: 28,
		right: 28,
		bottom: 18,
		paddingTop: 5,
		borderTopWidth: 0.5,
		borderTopColor: colors.border,
		flexDirection: "row",
		justifyContent: "space-between",
	},
	footerText: { fontSize: 6.5, color: colors.muted },
});

function summarize(report: BookingReport) {
	const { summary } = report;
	return [
		{ label: "Total", value: String(summary.total), color: colors.navy },
		{ label: "Approved", value: String(summary.approved), color: "#15803d" },
		{ label: "Pending", value: String(summary.pending), color: "#b45309" },
		{ label: "Rejected", value: String(summary.rejected), color: "#b91c1c" },
		{ label: "Cancelled", value: String(summary.cancelled), color: "#4b5563" },
		{
			label: "Attendees",
			value: summary.attendees.toLocaleString("en-US"),
			color: colors.blue,
		},
	];
}

export function BookingReportDocument({ report }: { report: BookingReport }) {
	const pages = paginateReportRows(report.rows);
	const summaryCells = summarize(report);
	const scope = `${report.periodLabel} · ${report.venueLabel} · ${report.statusLabel}`;

	return (
		<Document
			title={`${REPORT_TITLE} · ${report.periodLabel}`}
			author={REPORT_BRAND}
			subject={`${report.periodLabel} · ${report.venueLabel} · ${report.statusLabel}`}
			creator={REPORT_BRAND}
			producer={REPORT_BRAND}
			keywords="bookings, report, venue"
			language="en"
			creationDate={new Date(report.generatedAt)}
		>
			{pages.map((pageRows, pageIndex) => (
				<Page
					// biome-ignore lint/suspicious/noArrayIndexKey: report pages are positional
					key={`page-${pageIndex}`}
					size="A4"
					orientation="landscape"
					style={styles.page}
				>
					<View style={styles.brandRow}>
						<Text style={styles.brand}>{sanitizePdfText(REPORT_BRAND)}</Text>
						<Text style={styles.generated}>
							Generated {sanitizePdfText(report.generatedLabel)}
						</Text>
					</View>

					<View style={styles.titleRow}>
						<Text style={styles.title}>{REPORT_TITLE}</Text>
						{pageIndex > 0 ? (
							<Text style={styles.continued}>Continued</Text>
						) : null}
					</View>
					<Text style={styles.subtitle}>{sanitizePdfText(scope)}</Text>
					<View style={styles.rule} />

					{pageIndex === 0 ? (
						<View style={styles.summary}>
							{summaryCells.map((cell, index) => (
								<View
									key={cell.label}
									style={[
										styles.summaryCell,
										index === summaryCells.length - 1
											? styles.summaryCellLast
											: {},
									]}
								>
									<Text style={styles.summaryLabel}>{cell.label}</Text>
									<Text style={[styles.summaryValue, { color: cell.color }]}>
										{cell.value}
									</Text>
								</View>
							))}
						</View>
					) : null}

					<View style={styles.table}>
						<View style={styles.tableHead}>
							{PDF_COLUMNS.map((column) => (
								<View
									key={column.key}
									style={[styles.headCell, { width: `${column.pdfWidth}%` }]}
								>
									<Text
										style={[
											styles.headText,
											column.align === "right" ? styles.textRight : {},
										]}
									>
										{column.label}
									</Text>
								</View>
							))}
						</View>

						{pageRows.length === 0 ? (
							<View style={styles.emptyRow}>
								<Text style={styles.emptyText}>
									No bookings match the selected filters.
								</Text>
							</View>
						) : (
							pageRows.map((row, rowIndex) => (
								<View
									key={row.reference}
									style={[styles.row, rowIndex % 2 === 1 ? styles.rowAlt : {}]}
								>
									{PDF_COLUMNS.map((column) => (
										<View
											key={column.key}
											style={[styles.cell, { width: `${column.pdfWidth}%` }]}
										>
											{column.key === "status" ? (
												<View style={styles.status}>
													<View
														style={[
															styles.statusDot,
															{
																backgroundColor: STATUS_COLORS[row.status].dot,
															},
														]}
													/>
													<Text
														style={[
															styles.statusText,
															{ color: STATUS_COLORS[row.status].text },
														]}
													>
														{reportPdfValue(column, row)}
													</Text>
												</View>
											) : (
												<Text
													style={[
														styles.cellText,
														column.align === "right"
															? styles.cellTextRight
															: {},
													]}
												>
													{sanitizePdfText(
														truncateText(
															reportPdfValue(column, row),
															column.pdfMaxChars,
														),
													)}
												</Text>
											)}
										</View>
									))}
								</View>
							))
						)}
					</View>

					<View style={styles.footer} fixed>
						<Text style={styles.footerText}>
							{sanitizePdfText(REPORT_BRAND)} · {REPORT_TITLE} ·{" "}
							{sanitizePdfText(report.periodLabel)}
						</Text>
						<Text style={styles.footerText}>
							Page {pageIndex + 1} of {pages.length}
						</Text>
					</View>
				</Page>
			))}
		</Document>
	);
}
