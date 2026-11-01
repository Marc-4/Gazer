import {
	CalendarRange,
	FileDown,
	FileSpreadsheet,
	FileText,
	Loader2,
	RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Separator } from "#/components/ui/separator";
import {
	type BookingFilter,
	countBookingReportRows,
	fetchBookingReportRows,
	type VenueOption,
} from "#/lib/admin-queries";
import {
	type BookingReportFilters,
	buildBookingReport,
	formatPeriodLabel,
	formatStatusLabel,
	isPeriodValid,
	REPORT_FORMAT_LABELS,
	type ReportFormat,
	type ReportPeriodPreset,
	resolvePeriodPreset,
	STATUS_ORDER,
} from "#/lib/booking-report";
import { exportBookingReport } from "#/lib/booking-report-export";
import { bookingStatusLabel } from "#/lib/format";
import type { BookingStatus } from "#/lib/types";
import { useDebouncedValue } from "#/lib/use-debounced-value";
import { cn } from "#/lib/utils";

const FORMAT_OPTIONS: Array<{
	value: ReportFormat;
	label: string;
	description: string;
	icon: typeof FileText;
}> = [
	{
		value: "xlsx",
		label: "Excel",
		description: "Workbook with bookings and a summary sheet",
		icon: FileSpreadsheet,
	},
	{
		value: "csv",
		label: "CSV",
		description: "Plain table for spreadsheets and scripts",
		icon: FileText,
	},
	{
		value: "pdf",
		label: "PDF",
		description: "Print-ready report with totals",
		icon: FileDown,
	},
];

const PERIOD_PRESETS: Array<{
	value: Exclude<ReportPeriodPreset, "custom">;
	label: string;
}> = [
	{ value: "all", label: "All dates" },
	{ value: "next-30-days", label: "Next 30 days" },
	{ value: "last-30-days", label: "Last 30 days" },
	{ value: "this-month", label: "This month" },
	{ value: "last-month", label: "Last month" },
];

export interface BookingReportDefaults {
	status?: BookingFilter;
	venueId?: string;
	date?: string;
}

export function BookingReportDialog({
	open,
	onOpenChange,
	venues,
	defaults,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	venues: VenueOption[];
	defaults?: BookingReportDefaults;
}) {
	const defaultDate = defaults?.date ?? "";
	const defaultVenueId = defaults?.venueId ?? "";
	const defaultStatus = defaults?.status ?? "all";

	const [format, setFormat] = useState<ReportFormat>("xlsx");
	const [preset, setPreset] = useState<ReportPeriodPreset>("all");
	const [from, setFrom] = useState(defaultDate);
	const [to, setTo] = useState(defaultDate);
	const [venueMode, setVenueMode] = useState<"all" | "selected">(
		defaultVenueId ? "selected" : "all",
	);
	const [venueIds, setVenueIds] = useState<string[]>(
		defaultVenueId ? [defaultVenueId] : [],
	);
	const [statuses, setStatuses] = useState<BookingStatus[]>(
		defaultStatus === "all" ? [...STATUS_ORDER] : [defaultStatus],
	);
	const [count, setCount] = useState<number | null>(null);
	const [counting, setCounting] = useState(false);
	const [exporting, setExporting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setFormat("xlsx");
		setPreset(defaultDate ? "custom" : "all");
		setFrom(defaultDate);
		setTo(defaultDate);
		setVenueMode(defaultVenueId ? "selected" : "all");
		setVenueIds(defaultVenueId ? [defaultVenueId] : []);
		setStatuses(defaultStatus === "all" ? [...STATUS_ORDER] : [defaultStatus]);
		setCount(null);
		setCounting(false);
		setExporting(false);
		setError(null);
	}, [open, defaultDate, defaultVenueId, defaultStatus]);

	const filters = useMemo<BookingReportFilters>(
		() => ({
			from,
			to,
			venueIds: venueMode === "all" ? [] : venueIds,
			statuses,
		}),
		[from, to, venueMode, venueIds, statuses],
	);
	const debouncedFilters = useDebouncedValue(filters, 250);

	const periodValid = isPeriodValid(filters);
	const venuesValid = venueMode === "all" || venueIds.length > 0;
	const statusesValid = statuses.length > 0;
	const selectionValid = periodValid && venuesValid && statusesValid;

	const validationMessage = !periodValid
		? "The start date must be on or before the end date."
		: !venuesValid
			? "Select at least one venue, or choose all venues."
			: !statusesValid
				? "Select at least one status."
				: null;

	useEffect(() => {
		if (!open) return;
		if (!selectionValid) {
			setCount(null);
			setCounting(false);
			return;
		}

		let active = true;
		setCounting(true);
		countBookingReportRows(debouncedFilters)
			.then((nextCount) => {
				if (!active) return;
				setCount(nextCount);
				setCounting(false);
			})
			.catch((countError: unknown) => {
				if (!active) return;
				setCount(null);
				setCounting(false);
				setError(
					countError instanceof Error
						? countError.message
						: "Unable to count bookings.",
				);
			});

		return () => {
			active = false;
		};
	}, [open, debouncedFilters, selectionValid]);

	const venueNames = useMemo(() => {
		const map: Record<string, string> = {};
		for (const venue of venues) map[venue.id] = venue.name;
		return map;
	}, [venues]);

	const applyPreset = (next: Exclude<ReportPeriodPreset, "custom">) => {
		const period = resolvePeriodPreset(next);
		setPreset(next);
		setFrom(period.from);
		setTo(period.to);
		setError(null);
	};

	const toggleVenue = (venueId: string, checked: boolean) => {
		setVenueMode("selected");
		setVenueIds((current) =>
			checked
				? Array.from(new Set([...current, venueId]))
				: current.filter((id) => id !== venueId),
		);
		setError(null);
	};

	const toggleStatus = (status: BookingStatus) => {
		setStatuses((current) =>
			current.includes(status)
				? current.filter((value) => value !== status)
				: STATUS_ORDER.filter(
						(value) => current.includes(value) || value === status,
					),
		);
		setError(null);
	};

	const reset = () => {
		setPreset(defaultDate ? "custom" : "all");
		setFrom(defaultDate);
		setTo(defaultDate);
		setVenueMode(defaultVenueId ? "selected" : "all");
		setVenueIds(defaultVenueId ? [defaultVenueId] : []);
		setStatuses(defaultStatus === "all" ? [...STATUS_ORDER] : [defaultStatus]);
		setError(null);
	};

	const canExport = selectionValid && !counting && !exporting && count !== 0;

	const handleExport = async () => {
		if (!canExport) return;
		setExporting(true);
		setError(null);

		try {
			const rows = await fetchBookingReportRows(filters);
			if (rows.length === 0) {
				setError("No bookings match these filters.");
				return;
			}

			const report = buildBookingReport({
				rows,
				filters,
				venueNames,
				generatedAt: new Date().toISOString(),
			});
			await exportBookingReport(report, format);
			toast.success(
				`${rows.length.toLocaleString("en-US")} ${
					rows.length === 1 ? "booking" : "bookings"
				} exported as ${REPORT_FORMAT_LABELS[format]}.`,
			);
			onOpenChange(false);
		} catch (exportError) {
			setError(
				exportError instanceof Error
					? exportError.message
					: "Unable to export bookings.",
			);
		} finally {
			setExporting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Export bookings</DialogTitle>
					<DialogDescription>
						Build a report from the bookings that match your filters. Only the
						selected rows are downloaded.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-5">
					<section className="space-y-2">
						<p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
							File format
						</p>
						<div className="grid gap-2 sm:grid-cols-3">
							{FORMAT_OPTIONS.map((option) => {
								const active = format === option.value;
								return (
									<button
										key={option.value}
										type="button"
										aria-pressed={active}
										onClick={() => setFormat(option.value)}
										className={cn(
											"flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
											active
												? "border-primary bg-primary/5 ring-1 ring-primary/30"
												: "border-border/70 hover:bg-muted/60",
										)}
									>
										<span className="flex items-center gap-1.5 text-sm font-semibold">
											<option.icon className="size-4" />
											{option.label}
										</span>
										<span className="text-[11px] leading-snug text-muted-foreground">
											{option.description}
										</span>
									</button>
								);
							})}
						</div>
					</section>

					<Separator />

					<section className="space-y-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
								Booking date
							</p>
							<p className="text-xs text-muted-foreground">
								{formatPeriodLabel(from, to)}
							</p>
						</div>
						<div className="flex flex-wrap gap-1.5">
							{PERIOD_PRESETS.map((option) => (
								<Button
									key={option.value}
									type="button"
									size="xs"
									variant={preset === option.value ? "default" : "outline"}
									onClick={() => applyPreset(option.value)}
								>
									{option.label}
								</Button>
							))}
						</div>
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="space-y-1.5">
								<Label htmlFor="report-from">From</Label>
								<Input
									id="report-from"
									type="date"
									value={from}
									max={to || undefined}
									onChange={(event) => {
										setFrom(event.target.value);
										setPreset("custom");
										setError(null);
									}}
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="report-to">To</Label>
								<Input
									id="report-to"
									type="date"
									value={to}
									min={from || undefined}
									onChange={(event) => {
										setTo(event.target.value);
										setPreset("custom");
										setError(null);
									}}
								/>
							</div>
						</div>
						<p className="text-xs text-muted-foreground">
							Filters on the requested venue date, not the date the request was
							submitted. Leave both blank to include every date.
						</p>
					</section>

					<Separator />

					<section className="space-y-2">
						<div className="flex items-center justify-between gap-2">
							<p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
								Venues
							</p>
							<p className="text-xs text-muted-foreground">
								{venueMode === "all"
									? "All venues"
									: `${venueIds.length} selected`}
							</p>
						</div>
						<div className="max-h-48 overflow-y-auto rounded-lg border border-border/70">
							<label
								htmlFor="report-venue-all"
								className="flex cursor-pointer items-center gap-2.5 border-b border-border/70 bg-muted/40 px-3 py-2 text-sm font-medium"
							>
								<Checkbox
									id="report-venue-all"
									checked={venueMode === "all"}
									onCheckedChange={() => {
										setVenueMode("all");
										setVenueIds([]);
										setError(null);
									}}
								/>
								All venues
							</label>
							{venues.length === 0 ? (
								<p className="px-3 py-3 text-sm text-muted-foreground">
									No venues available.
								</p>
							) : (
								venues.map((venue) => (
									<label
										key={venue.id}
										htmlFor={`report-venue-${venue.id}`}
										className="flex cursor-pointer items-center gap-2.5 border-b border-border/40 px-3 py-2 text-sm last:border-b-0 hover:bg-muted/40"
									>
										<Checkbox
											id={`report-venue-${venue.id}`}
											checked={
												venueMode === "selected" && venueIds.includes(venue.id)
											}
											onCheckedChange={(checked) =>
												toggleVenue(venue.id, checked === true)
											}
										/>
										<span className="truncate">{venue.name}</span>
									</label>
								))
							)}
						</div>
					</section>

					<Separator />

					<section className="space-y-2">
						<div className="flex items-center justify-between gap-2">
							<p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
								Status
							</p>
							<p className="text-xs text-muted-foreground">
								{formatStatusLabel(statuses)}
							</p>
						</div>
						<div className="flex flex-wrap gap-1.5">
							{STATUS_ORDER.map((status) => {
								const active = statuses.includes(status);
								return (
									<Button
										key={status}
										type="button"
										size="xs"
										variant={active ? "default" : "outline"}
										aria-pressed={active}
										onClick={() => toggleStatus(status)}
									>
										{bookingStatusLabel[status]}
									</Button>
								);
							})}
						</div>
					</section>

					{validationMessage || error ? (
						<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive">
							{validationMessage ?? error}
						</div>
					) : null}
				</div>

				<DialogFooter className="gap-2 sm:justify-between">
					<div className="flex items-center gap-3">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={reset}
							disabled={exporting}
						>
							<RotateCcw className="size-3.5" />
							Reset
						</Button>
						<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
							{counting ? (
								<>
									<Loader2 className="size-3.5 animate-spin" />
									Counting bookings…
								</>
							) : count === null ? (
								<>
									<CalendarRange className="size-3.5" />
									Choose filters to preview the export
								</>
							) : (
								<>
									<CalendarRange className="size-3.5" />
									{count.toLocaleString("en-US")}{" "}
									{count === 1 ? "booking" : "bookings"} will be exported
								</>
							)}
						</span>
					</div>
					<div className="flex flex-col-reverse gap-2 sm:flex-row">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={exporting}
						>
							Cancel
						</Button>
						<Button type="button" onClick={handleExport} disabled={!canExport}>
							{exporting ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<FileDown className="size-4" />
							)}
							{exporting
								? "Preparing…"
								: `Export ${REPORT_FORMAT_LABELS[format]}`}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
