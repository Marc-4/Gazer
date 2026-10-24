import {
	addMonths,
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	format,
	isSameMonth,
	isToday,
	startOfMonth,
	startOfWeek,
	subMonths,
} from "date-fns";
import {
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	Clock,
	Loader2,
	TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import {
	type AvailabilityTone,
	availabilityTone,
	groupAvailabilityByDate,
	isAvailabilityBlocked,
} from "#/lib/availability";
import {
	formatDate,
	formatTimeRange,
	todayIsoDate,
	toLocalDate,
} from "#/lib/format";
import { supabase } from "#/lib/supabase";
import type { AvailabilityEntry } from "#/lib/types";
import { cn } from "#/lib/utils";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const toneStyles: Record<AvailabilityTone, string> = {
	free: "bg-emerald-50/50 hover:bg-emerald-100/70 dark:bg-emerald-400/5 dark:hover:bg-emerald-400/10",
	pending:
		"bg-amber-50/70 hover:bg-amber-100/80 dark:bg-amber-400/10 dark:hover:bg-amber-400/15",
	approved:
		"bg-rose-50/60 hover:bg-rose-100/80 dark:bg-rose-400/10 dark:hover:bg-rose-400/15",
	school:
		"bg-[#f0c75e]/10 hover:bg-[#f0c75e]/20 dark:bg-[#f0c75e]/5 dark:hover:bg-[#f0c75e]/10",
};

const chipStyles: Record<AvailabilityTone, string> = {
	free: "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/20 dark:text-emerald-100",
	pending:
		"bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100",
	approved: "bg-rose-100 text-rose-900 dark:bg-rose-400/20 dark:text-rose-100",
	school: "bg-[#0b1f3a] text-[#f0c75e] dark:bg-[#f0c75e] dark:text-[#0b1f3a]",
};

const legend: Array<{ tone: AvailabilityTone; label: string }> = [
	{ tone: "free", label: "Available" },
	{ tone: "pending", label: "Pending" },
	{ tone: "approved", label: "Booked" },
	{ tone: "school", label: "School event" },
];

function entryTone(entry: AvailabilityEntry): AvailabilityTone {
	if (entry.kind === "school_event") return "school";
	if (entry.status === "approved") return "approved";
	return "pending";
}

function entryLabel(entry: AvailabilityEntry, allVenues: boolean) {
	if (entry.kind === "school_event") {
		const label = entry.label ?? "School event";
		return allVenues ? `${entry.venue_name} · ${label}` : label;
	}

	const status = entry.status === "approved" ? "Booked" : "Pending";
	return allVenues ? `${entry.venue_name} · ${status}` : status;
}

function entryTime(entry: AvailabilityEntry) {
	if (entry.kind === "school_event" && !entry.start_time && !entry.end_time) {
		return "All day";
	}
	return formatTimeRange(entry.start_time, entry.end_time);
}

function entryTitle(entry: AvailabilityEntry) {
	return `${entryLabel(entry, true)} · ${entryTime(entry)}`;
}

export function AvailabilityCalendar({
	venueId,
	venueName,
	selectedDate,
	selectedStartTime,
	selectedEndTime,
	onSelectDate,
	onDayAvailabilityChange,
	compact = false,
	embedded = false,
	className,
}: {
	venueId?: string | null;
	venueName?: string | null;
	selectedDate?: string;
	selectedStartTime?: string | null;
	selectedEndTime?: string | null;
	onSelectDate: (date: string) => void;
	onDayAvailabilityChange?: (
		date: string,
		entries: AvailabilityEntry[],
		loading: boolean,
	) => void;
	compact?: boolean;
	embedded?: boolean;
	className?: string;
}) {
	const [month, setMonth] = useState(() => startOfMonth(new Date()));
	const [entries, setEntries] = useState<AvailabilityEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const onDayChangeRef = useRef(onDayAvailabilityChange);

	useEffect(() => {
		onDayChangeRef.current = onDayAvailabilityChange;
	}, [onDayAvailabilityChange]);

	useEffect(() => {
		if (!selectedDate) return;
		const selected = toLocalDate(selectedDate);
		setMonth((current) =>
			isSameMonth(current, selected) ? current : startOfMonth(selected),
		);
	}, [selectedDate]);

	useEffect(() => {
		let active = true;
		const start = startOfWeek(startOfMonth(month));
		const end = endOfWeek(endOfMonth(month));

		setLoading(true);
		setError(null);
		setEntries([]);

		supabase
			.rpc("get_venue_availability", {
				p_from: format(start, "yyyy-MM-dd"),
				p_to: format(end, "yyyy-MM-dd"),
				p_venue_id: venueId || null,
			})
			.then(({ data, error: rpcError }) => {
				if (!active) return;
				if (rpcError) {
					setError(rpcError.message);
					setLoading(false);
					return;
				}
				setEntries((data as AvailabilityEntry[] | null) ?? []);
				setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [month, venueId]);

	const byDate = useMemo(() => groupAvailabilityByDate(entries), [entries]);
	const days = useMemo(() => {
		const start = startOfWeek(startOfMonth(month));
		const end = endOfWeek(endOfMonth(month));
		return eachDayOfInterval({ start, end });
	}, [month]);

	useEffect(() => {
		onDayChangeRef.current?.(
			selectedDate ?? "",
			selectedDate ? (byDate.get(selectedDate) ?? []) : [],
			loading,
		);
	}, [selectedDate, byDate, loading]);

	const allVenues = !venueId;
	const selectedEntries = selectedDate ? (byDate.get(selectedDate) ?? []) : [];
	const selectedTone = availabilityTone(selectedEntries);
	const selectedBlocked = isAvailabilityBlocked(
		selectedEntries,
		selectedStartTime,
		selectedEndTime,
	);
	const today = todayIsoDate();

	const goToMonth = (next: Date) => {
		setMonth(startOfMonth(next));
	};

	return (
		<Card
			className={cn(
				"border-border/70",
				embedded && "gap-0 border-0 bg-transparent py-0 shadow-none",
				className,
			)}
		>
			<CardHeader
				className={cn(
					"flex-row items-start justify-between gap-3",
					compact && "p-4 pb-3",
					embedded && "px-0 pb-3",
				)}
			>
				<div>
					<CardTitle
						className={cn(
							"flex items-center gap-2 font-[Fraunces,Georgia,serif]",
							compact ? "text-base" : "text-xl",
						)}
					>
						<CalendarDays className="size-4 text-[#2451d8] dark:text-[#f0c75e]" />
						Availability
					</CardTitle>
					<p className="mt-1 text-xs text-muted-foreground">
						{venueName ?? (venueId ? "Selected venue" : "All venues")} · Click a
						date to use it.
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<Button
						type="button"
						variant="outline"
						size="icon-sm"
						aria-label="Previous month"
						onClick={() => goToMonth(subMonths(month, 1))}
					>
						<ChevronLeft className="size-4" />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							const todayDate = todayIsoDate();
							setMonth(startOfMonth(toLocalDate(todayDate)));
							onSelectDate(todayDate);
						}}
					>
						Today
					</Button>
					<Button
						type="button"
						variant="outline"
						size="icon-sm"
						aria-label="Next month"
						onClick={() => goToMonth(addMonths(month, 1))}
					>
						<ChevronRight className="size-4" />
					</Button>
				</div>
			</CardHeader>
			<CardContent className={cn(compact && "p-4 pt-0", embedded && "px-0")}>
				<div className="mb-3 flex items-center justify-between gap-2">
					<p className={cn("font-semibold", compact ? "text-sm" : "text-base")}>
						{format(month, "MMMM yyyy")}
					</p>
					{!loading && !error ? (
						<p className="text-[11px] text-muted-foreground">
							{entries.length} {entries.length === 1 ? "entry" : "entries"}
						</p>
					) : null}
				</div>

				{loading ? (
					<Skeleton
						className={cn("w-full rounded-xl", compact ? "h-64" : "h-[520px]")}
					/>
				) : error ? (
					<div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-destructive/40 bg-destructive/5 px-4 py-8 text-center">
						<TriangleAlert className="size-5 text-destructive" />
						<p className="mt-2 text-sm font-semibold">
							Unable to load availability
						</p>
						<p className="mt-1 max-w-sm text-xs text-muted-foreground">
							{error}
						</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="mt-3"
							onClick={() => setMonth((current) => new Date(current))}
						>
							<Loader2 className="size-3.5" />
							Try again
						</Button>
					</div>
				) : (
					<div className="overflow-x-auto">
						<div className={cn(compact ? "min-w-[540px]" : "min-w-[600px]")}>
							<div className="grid grid-cols-7 border-b border-border/70 pb-2">
								{weekdayLabels.map((label) => (
									<div
										key={label}
										className="px-1 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
									>
										{label}
									</div>
								))}
							</div>
							<div className="grid auto-rows-fr grid-cols-7">
								{days.map((day) => {
									const key = format(day, "yyyy-MM-dd");
									const dayEntries = byDate.get(key) ?? [];
									const tone = availabilityTone(dayEntries);
									const inMonth = isSameMonth(day, month);
									const selected = key === selectedDate;
									const isPast = key < today;
									const visibleEntries = dayEntries.slice(0, compact ? 1 : 2);
									const hiddenCount = dayEntries.length - visibleEntries.length;

									return (
										<button
											key={key}
											type="button"
											disabled={isPast}
											aria-pressed={selected}
											aria-label={`View availability for ${formatDate(key)}`}
											onClick={() => onSelectDate(key)}
											className={cn(
												"flex flex-col border-b border-r border-border/60 p-1.5 text-left align-top transition-colors",
												compact ? "min-h-16" : "min-h-20",
												inMonth ? toneStyles[tone] : "bg-muted/30",
												isPast && "cursor-not-allowed opacity-45",
												!inMonth && "text-muted-foreground",
												selected &&
													"ring-2 ring-inset ring-[#2451d8] dark:ring-[#f0c75e]",
											)}
										>
											<div className="flex items-center justify-between gap-1">
												<span
													className={cn(
														"grid size-6 place-items-center rounded-full text-xs font-semibold",
														isToday(day) &&
															"bg-[#2451d8] text-white dark:bg-[#f0c75e] dark:text-[#0b1f3a]",
													)}
												>
													{format(day, "d")}
												</span>
												{dayEntries.length > 0 ? (
													<span className="text-[10px] font-semibold text-muted-foreground">
														{dayEntries.length}
													</span>
												) : null}
											</div>
											<div className="mt-1 min-h-0 space-y-1 overflow-hidden">
												{visibleEntries.map((entry) => (
													<div
														key={`${entry.venue_id}-${entry.kind}-${entry.status}-${entry.start_time ?? "all"}-${entry.end_time ?? "all"}-${entry.label ?? ""}`}
														title={entryTitle(entry)}
														className={cn(
															"truncate rounded px-1 py-0.5 text-[10px] font-semibold",
															chipStyles[entryTone(entry)],
														)}
													>
														{entryLabel(entry, allVenues)}
													</div>
												))}
												{hiddenCount > 0 ? (
													<p className="px-1 text-[10px] font-semibold text-muted-foreground">
														+{hiddenCount} more
													</p>
												) : null}
											</div>
										</button>
									);
								})}
							</div>
						</div>
					</div>
				)}

				<div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
					{legend.map((item) => (
						<span key={item.tone} className="flex items-center gap-1.5">
							<span
								className={cn(
									"size-2 rounded-full",
									item.tone === "free" && "bg-emerald-500",
									item.tone === "pending" && "bg-amber-500",
									item.tone === "approved" && "bg-rose-500",
									item.tone === "school" && "bg-[#0b1f3a] dark:bg-[#f0c75e]",
								)}
							/>
							{item.label}
						</span>
					))}
				</div>

				{selectedDate ? (
					<div
						className={cn(
							"mt-3 rounded-xl border p-3",
							selectedBlocked
								? "border-rose-300/60 bg-rose-50/70 dark:border-rose-400/25 dark:bg-rose-400/10"
								: "border-emerald-300/60 bg-emerald-50/70 dark:border-emerald-400/25 dark:bg-emerald-400/10",
						)}
					>
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="text-sm font-bold">{formatDate(selectedDate)}</p>
								<p className="text-xs text-muted-foreground">
									{selectedBlocked
										? selectedTone === "school"
											? "Reserved for a school event."
											: selectedStartTime && selectedEndTime
												? "Already held during the selected time."
												: "Already held by another booking."
										: selectedEntries.length > 0
											? "Available for the selected time."
											: "Available for a new booking."}
								</p>
							</div>
							<span
								className={cn(
									"rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
									selectedBlocked
										? "bg-rose-100 text-rose-900 dark:bg-rose-400/20 dark:text-rose-100"
										: "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/20 dark:text-emerald-100",
								)}
							>
								{selectedBlocked ? "Unavailable" : "Available"}
							</span>
						</div>
						{selectedEntries.length > 0 ? (
							<div className="mt-2 space-y-1.5">
								{selectedEntries.map((entry) => (
									<div
										key={`${entry.venue_id}-${entry.kind}-${entry.status}-${entry.start_time ?? "all"}-${entry.end_time ?? "all"}-${entry.label ?? ""}`}
										className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
									>
										<span className="font-semibold">
											{entry.kind === "school_event"
												? (entry.label ?? "School event")
												: entry.status === "approved"
													? "Booked"
													: "Pending"}
										</span>
										<span className="text-muted-foreground">
											{entry.venue_name}
										</span>
										<span className="flex items-center gap-1 text-muted-foreground">
											<Clock className="size-3" />
											{entryTime(entry)}
										</span>
									</div>
								))}
							</div>
						) : null}
					</div>
				) : (
					<p className="mt-3 text-xs text-muted-foreground">
						Select a date to see availability details.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
