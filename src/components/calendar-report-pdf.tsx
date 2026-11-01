import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { sanitizePdfText, truncateText } from "#/lib/booking-report";
import {
	CALENDAR_MAX_ITEMS_PER_DAY,
	type CalendarReport,
	type CalendarReportDay,
	type CalendarReportRow,
	paginateCalendarRows,
} from "#/lib/calendar-report";

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
	outside: "#fafbfe",
};

const STATUS_COLORS = {
	approved: { dot: "#16a34a", background: "#e8f7ee", text: "#15803d" },
	pending: { dot: "#d97706", background: "#fdf3e2", text: "#b45309" },
	rejected: { dot: "#dc2626", background: "#fdeceb", text: "#b91c1c" },
	cancelled: { dot: "#6b7280", background: "#f1f3f6", text: "#4b5563" },
};

const styles = StyleSheet.create({
	page: {
		paddingTop: 22,
		paddingBottom: 34,
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
		marginTop: 4,
	},
	title: {
		fontFamily: "Helvetica-Bold",
		fontSize: 19,
		color: colors.navy,
		letterSpacing: -0.2,
	},
	subtitle: { fontSize: 8, color: "#4b5563", marginTop: 2 },
	rule: { height: 2, width: 64, backgroundColor: colors.gold, marginTop: 6 },

	summary: {
		flexDirection: "row",
		marginTop: 7,
		borderWidth: 0.75,
		borderColor: colors.border,
		backgroundColor: colors.panel,
		borderRadius: 4,
	},
	summaryCell: {
		flex: 1,
		paddingVertical: 5,
		paddingHorizontal: 8,
		borderRightWidth: 0.75,
		borderRightColor: colors.border,
	},
	summaryCellLast: { borderRightWidth: 0 },
	summaryLabel: {
		fontFamily: "Helvetica-Bold",
		fontSize: 5.8,
		letterSpacing: 0.7,
		textTransform: "uppercase",
		color: colors.muted,
	},
	summaryValue: {
		fontFamily: "Helvetica-Bold",
		fontSize: 11,
		marginTop: 1,
	},

	legend: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 6,
		marginBottom: 6,
	},
	legendItem: {
		flexDirection: "row",
		alignItems: "center",
		marginRight: 12,
	},
	legendDot: { width: 5, height: 5, borderRadius: 2.5, marginRight: 3 },
	legendText: { fontSize: 6.3, color: colors.muted },

	grid: {
		flexGrow: 1,
		borderTopWidth: 0.75,
		borderLeftWidth: 0.75,
		borderColor: colors.border,
	},
	weekdayRow: {
		flexDirection: "row",
		height: 16,
		backgroundColor: colors.navy,
	},
	weekdayCell: {
		width: "14.2857%",
		paddingVertical: 3,
		textAlign: "center",
		fontFamily: "Helvetica-Bold",
		fontSize: 6.5,
		letterSpacing: 0.7,
		textTransform: "uppercase",
		color: "#ffffff",
	},
	weekRow: { flexDirection: "row", flexGrow: 1 },
	dayCell: {
		width: "14.2857%",
		borderRightWidth: 0.75,
		borderBottomWidth: 0.75,
		borderColor: colors.border,
		padding: 3,
	},
	dayCellOutside: { backgroundColor: colors.outside },
	dayNumberRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	dayNumber: {
		fontFamily: "Helvetica-Bold",
		fontSize: 8,
		color: colors.navy,
	},
	dayNumberOutside: { color: "#9aa5b5" },
	dayCount: { fontSize: 5.8, color: colors.muted },
	dayItems: { marginTop: 2 },
	dayItem: {
		borderRadius: 2,
		paddingHorizontal: 2.5,
		paddingVertical: 1.2,
		marginBottom: 1.5,
	},
	dayItemEvent: { backgroundColor: colors.navy },
	dayItemText: {
		fontSize: 5.4,
		lineHeight: 1.15,
	},
	dayItemEventText: { color: colors.gold },
	dayItemBookingText: { color: colors.text },
	dayMore: {
		fontSize: 5.4,
		color: colors.muted,
		paddingHorizontal: 2,
	},

	scheduleHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-end",
		marginBottom: 8,
	},
	scheduleTitle: {
		fontFamily: "Helvetica-Bold",
		fontSize: 13,
		color: colors.navy,
	},
	scheduleSubtitle: { fontSize: 7, color: colors.muted },
	tableHead: {
		flexDirection: "row",
		alignItems: "center",
		height: 18,
		backgroundColor: colors.navy,
		borderTopLeftRadius: 3,
		borderTopRightRadius: 3,
	},
	headText: {
		fontFamily: "Helvetica-Bold",
		fontSize: 5.9,
		letterSpacing: 0.5,
		textTransform: "uppercase",
		color: "#ffffff",
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		height: 14.5,
		borderBottomWidth: 0.5,
		borderBottomColor: colors.rowBorder,
	},
	rowAlt: { backgroundColor: colors.stripe },
	cell: { paddingHorizontal: 4 },
	cellText: { fontSize: 6.4, color: colors.text },
	status: { flexDirection: "row", alignItems: "center" },
	statusDot: { width: 4, height: 4, borderRadius: 2, marginRight: 3 },
	statusText: { fontFamily: "Helvetica-Bold", fontSize: 5.9 },

	empty: {
		marginTop: 10,
		paddingVertical: 18,
		alignItems: "center",
		borderWidth: 0.75,
		borderColor: colors.border,
		borderRadius: 4,
	},
	emptyText: { fontSize: 8, color: colors.muted },
	footer: {
		position: "absolute",
		left: 28,
		right: 28,
		bottom: 14,
		paddingTop: 4,
		borderTopWidth: 0.5,
		borderTopColor: colors.border,
		flexDirection: "row",
		justifyContent: "space-between",
	},
	footerText: { fontSize: 6.2, color: colors.muted },
});

function pdf(value: string, max = 200) {
	return truncateText(sanitizePdfText(value), max);
}

function DayCell({ day }: { day: CalendarReportDay }) {
	const visible = day.items.slice(0, CALENDAR_MAX_ITEMS_PER_DAY);
	const hidden = day.items.length - visible.length;

	return (
		<View
			style={[styles.dayCell, !day.inMonth ? styles.dayCellOutside : undefined]}
		>
			<View style={styles.dayNumberRow}>
				<Text
					style={[
						styles.dayNumber,
						!day.inMonth ? styles.dayNumberOutside : undefined,
					]}
				>
					{day.dayLabel}
				</Text>
				{day.items.length > 0 ? (
					<Text style={styles.dayCount}>{day.items.length}</Text>
				) : null}
			</View>
			<View style={styles.dayItems}>
				{visible.map((item) =>
					item.kind === "event" ? (
						<View key={item.id} style={[styles.dayItem, styles.dayItemEvent]}>
							<Text style={[styles.dayItemText, styles.dayItemEventText]}>
								{pdf(`★ ${item.title}`, 34)}
							</Text>
						</View>
					) : (
						<View
							key={item.id}
							style={[
								styles.dayItem,
								{
									backgroundColor:
										STATUS_COLORS[item.status ?? "pending"].background,
								},
							]}
						>
							<Text
								style={[
									styles.dayItemText,
									styles.dayItemBookingText,
									{ color: STATUS_COLORS[item.status ?? "pending"].text },
								]}
							>
								{pdf(item.venueName, 18)} · {pdf(item.timeLabel, 14)}
							</Text>
						</View>
					),
				)}
				{hidden > 0 ? <Text style={styles.dayMore}>+{hidden} more</Text> : null}
			</View>
		</View>
	);
}

function ScheduleRow({
	row,
	index,
}: {
	row: CalendarReportRow;
	index: number;
}) {
	const status =
		row.statusLabel === "Blocked"
			? { dot: colors.gold, text: colors.navy }
			: (STATUS_COLORS[
					row.statusLabel.toLowerCase() as keyof typeof STATUS_COLORS
				] ?? { dot: colors.muted, text: colors.text });

	return (
		<View style={[styles.row, index % 2 === 1 ? styles.rowAlt : undefined]}>
			<View style={[styles.cell, { width: 68 }]}>
				<Text style={styles.cellText}>{pdf(row.dateLabel, 18)}</Text>
			</View>
			<View style={[styles.cell, { width: 78 }]}>
				<Text style={styles.cellText}>{pdf(row.timeLabel, 18)}</Text>
			</View>
			<View style={[styles.cell, { width: 52 }]}>
				<Text style={styles.cellText}>{pdf(row.kindLabel, 12)}</Text>
			</View>
			<View style={[styles.cell, { flexGrow: 1 }]}>
				<Text style={styles.cellText}>{pdf(row.title, 52)}</Text>
			</View>
			<View style={[styles.cell, { width: 108 }]}>
				<Text style={styles.cellText}>{pdf(row.venueName, 22)}</Text>
			</View>
			<View style={[styles.cell, { width: 62 }]}>
				<View style={styles.status}>
					<View style={[styles.statusDot, { backgroundColor: status.dot }]} />
					<Text style={[styles.statusText, { color: status.text }]}>
						{pdf(row.statusLabel, 12)}
					</Text>
				</View>
			</View>
			<View style={[styles.cell, { width: 80 }]}>
				<Text style={styles.cellText}>{pdf(row.reference, 16)}</Text>
			</View>
		</View>
	);
}

function Footer({
	left,
	page,
	total,
}: {
	left: string;
	page: number;
	total: number;
}) {
	return (
		<View style={styles.footer} fixed>
			<Text style={styles.footerText}>{pdf(left, 110)}</Text>
			<Text style={styles.footerText}>
				Page {page} of {total}
			</Text>
		</View>
	);
}

export function CalendarReportDocument({ report }: { report: CalendarReport }) {
	const schedulePages = paginateCalendarRows(report.rows);
	const totalPages = 1 + schedulePages.length;
	const scope = `${report.venueLabel} · ${report.statusLabel}`;
	const summary = [
		{ label: "Bookings", value: String(report.summary.bookings) },
		{ label: "School events", value: String(report.summary.events) },
		{ label: "Dates in use", value: String(report.summary.datesInUse) },
		{
			label: "Attendees",
			value: report.summary.attendees.toLocaleString("en-US"),
		},
	];

	return (
		<Document
			title={`Calendar · ${report.monthLabel}`}
			author="NBSC Activity Booking System"
			subject={`${report.monthLabel} · ${scope}`}
		>
			<Page size="A4" orientation="landscape" style={styles.page}>
				<View style={styles.brandRow}>
					<Text style={styles.brand}>NBSC Activity Booking System</Text>
					<Text style={styles.generated}>
						Generated {pdf(report.generatedLabel)}
					</Text>
				</View>
				<View style={styles.titleRow}>
					<View>
						<Text style={styles.title}>{pdf(report.monthLabel)}</Text>
						<Text style={styles.subtitle}>{pdf(scope)}</Text>
					</View>
					<View style={styles.rule} />
				</View>

				<View style={styles.summary}>
					{summary.map((cell, index) => (
						<View
							key={cell.label}
							style={[
								styles.summaryCell,
								index === summary.length - 1
									? styles.summaryCellLast
									: undefined,
							]}
						>
							<Text style={styles.summaryLabel}>{cell.label}</Text>
							<Text style={styles.summaryValue}>{cell.value}</Text>
						</View>
					))}
				</View>

				<View style={styles.legend}>
					<View style={styles.legendItem}>
						<View
							style={[styles.legendDot, { backgroundColor: colors.navy }]}
						/>
						<Text style={styles.legendText}>School event</Text>
					</View>
					{(["approved", "pending", "rejected", "cancelled"] as const).map(
						(status) => (
							<View key={status} style={styles.legendItem}>
								<View
									style={[
										styles.legendDot,
										{ backgroundColor: STATUS_COLORS[status].dot },
									]}
								/>
								<Text style={styles.legendText}>
									{status.charAt(0).toUpperCase() + status.slice(1)}
								</Text>
							</View>
						),
					)}
				</View>

				<View style={styles.grid}>
					<View style={styles.weekdayRow}>
						{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
							<Text key={day} style={styles.weekdayCell}>
								{day}
							</Text>
						))}
					</View>
					{report.weeks.map((week) => (
						<View key={week.days[0]?.date ?? "week"} style={styles.weekRow}>
							{week.days.map((day) => (
								<DayCell key={day.date} day={day} />
							))}
						</View>
					))}
				</View>

				<Footer
					left={`${report.monthLabel} · ${scope}`}
					page={1}
					total={totalPages}
				/>
			</Page>

			{schedulePages.map((rows, pageIndex) => (
				<Page
					key={rows[0]?.date ?? `schedule-${pageIndex}`}
					size="A4"
					orientation="landscape"
					style={styles.page}
				>
					<View style={styles.brandRow}>
						<Text style={styles.brand}>NBSC Activity Booking System</Text>
						<Text style={styles.generated}>
							Generated {pdf(report.generatedLabel)}
						</Text>
					</View>
					<View style={styles.scheduleHeader}>
						<View>
							<Text style={styles.scheduleTitle}>
								{pdf(report.monthLabel)} schedule
							</Text>
							<Text style={styles.scheduleSubtitle}>{pdf(scope)}</Text>
						</View>
						<Text style={styles.scheduleSubtitle}>
							{report.rows.length} entries · {report.summary.datesInUse} dates
							in use
						</Text>
					</View>

					<View style={styles.tableHead}>
						<Text style={[styles.headText, styles.cell, { width: 68 }]}>
							Date
						</Text>
						<Text style={[styles.headText, styles.cell, { width: 78 }]}>
							Time
						</Text>
						<Text style={[styles.headText, styles.cell, { width: 52 }]}>
							Type
						</Text>
						<Text style={[styles.headText, styles.cell, { flexGrow: 1 }]}>
							Activity / event
						</Text>
						<Text style={[styles.headText, styles.cell, { width: 108 }]}>
							Venue
						</Text>
						<Text style={[styles.headText, styles.cell, { width: 62 }]}>
							Status
						</Text>
						<Text style={[styles.headText, styles.cell, { width: 80 }]}>
							Reference
						</Text>
					</View>

					{rows.length === 0 ? (
						<View style={styles.empty}>
							<Text style={styles.emptyText}>
								No bookings or school events match the current filters.
							</Text>
						</View>
					) : (
						rows.map((row, index) => (
							<ScheduleRow
								key={`${row.date}-${row.kindLabel}-${row.reference}-${row.title}`}
								row={row}
								index={index}
							/>
						))
					)}

					<Footer
						left={`${report.monthLabel} · ${scope}`}
						page={pageIndex + 2}
						total={totalPages}
					/>
				</Page>
			))}
		</Document>
	);
}
