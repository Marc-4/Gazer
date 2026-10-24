import { createFileRoute, Link } from "@tanstack/react-router";
import {
	addMonths,
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	format,
	isSameMonth,
	isToday,
	parseISO,
	startOfMonth,
	startOfWeek,
	subMonths,
} from "date-fns";
import {
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	Clock,
	MapPin,
	School,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "#/components/page-header";
import { BookingStatusBadge } from "#/components/status-badge";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { formatDate, formatTimeRange } from "#/lib/format";
import { supabase } from "#/lib/supabase";
import type {
	BookingStatus,
	BookingWithVenue,
	SchoolEventWithVenue,
	Venue,
} from "#/lib/types";
import { useBookingsRealtime } from "#/lib/use-realtime";
import { cn } from "#/lib/utils";

interface CalendarSearch {
	date?: string;
}

export const Route = createFileRoute("/admin/calendar")({
	validateSearch: (search: Record<string, unknown>): CalendarSearch => ({
		date:
			typeof search.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.date)
				? search.date
				: undefined,
	}),
	component: AdminCalendar,
});

type StatusFilter = "active" | "all" | BookingStatus;

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const chipStyles: Record<BookingStatus, string> = {
	pending:
		"bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100",
	approved:
		"bg-emerald-100 text-emerald-900 dark:bg-emerald-400/20 dark:text-emerald-100",
	rejected: "bg-rose-100 text-rose-900 dark:bg-rose-400/20 dark:text-rose-100",
	cancelled:
		"bg-slate-100 text-slate-700 dark:bg-slate-400/20 dark:text-slate-100",
};

function matchesStatus(booking: BookingWithVenue, filter: StatusFilter) {
	if (filter === "all") return true;
	if (filter === "active") {
		return booking.status === "pending" || booking.status === "approved";
	}
	return booking.status === filter;
}

function AdminCalendar() {
	const { date } = Route.useSearch();
	const navigate = Route.useNavigate();
	const initialDate = date ?? format(new Date(), "yyyy-MM-dd");
	const [month, setMonth] = useState(() => startOfMonth(parseISO(initialDate)));
	const [selectedDate, setSelectedDate] = useState(initialDate);
	const [bookings, setBookings] = useState<BookingWithVenue[]>([]);
	const [events, setEvents] = useState<SchoolEventWithVenue[]>([]);
	const [venues, setVenues] = useState<Venue[]>([]);
	const [loading, setLoading] = useState(true);
	const [venueFilter, setVenueFilter] = useState("all");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

	const load = useCallback(async () => {
		const [bookingsResult, eventsResult, venuesResult] = await Promise.all([
			supabase
				.from("bookings")
				.select("*, venue:venues(id, name, address, capacity)")
				.order("booking_date"),
			supabase
				.from("school_events")
				.select("*, venue:venues(id, name, address, capacity)")
				.order("event_date"),
			supabase.from("venues").select("*").order("name"),
		]);

		if (bookingsResult.error || eventsResult.error) {
			toast.error(
				bookingsResult.error?.message ??
					eventsResult.error?.message ??
					"Unable to load the calendar.",
			);
			setLoading(false);
			return;
		}

		setBookings((bookingsResult.data as BookingWithVenue[] | null) ?? []);
		setEvents((eventsResult.data as SchoolEventWithVenue[] | null) ?? []);
		setVenues((venuesResult.data as Venue[] | null) ?? []);
		setLoading(false);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	useBookingsRealtime(load);

	useEffect(() => {
		if (!date) return;
		const parsed = parseISO(date);
		if (Number.isNaN(parsed.getTime())) return;
		setMonth(startOfMonth(parsed));
		setSelectedDate(date);
	}, [date]);

	const filtered = useMemo(
		() =>
			bookings.filter(
				(booking) =>
					(venueFilter === "all" || booking.venue_id === venueFilter) &&
					matchesStatus(booking, statusFilter),
			),
		[bookings, venueFilter, statusFilter],
	);

	const filteredEvents = useMemo(
		() =>
			events.filter(
				(event) => venueFilter === "all" || event.venue_id === venueFilter,
			),
		[events, venueFilter],
	);

	const bookingsByDate = useMemo(() => {
		const map = new Map<string, BookingWithVenue[]>();
		for (const booking of filtered) {
			const existing = map.get(booking.booking_date) ?? [];
			existing.push(booking);
			map.set(booking.booking_date, existing);
		}
		return map;
	}, [filtered]);

	const eventsByDate = useMemo(() => {
		const map = new Map<string, SchoolEventWithVenue[]>();
		for (const event of filteredEvents) {
			const existing = map.get(event.event_date) ?? [];
			existing.push(event);
			map.set(event.event_date, existing);
		}
		return map;
	}, [filteredEvents]);

	const days = useMemo(() => {
		const start = startOfWeek(startOfMonth(month));
		const end = endOfWeek(endOfMonth(month));
		return eachDayOfInterval({ start, end });
	}, [month]);

	const monthPrefix = format(month, "yyyy-MM");
	const monthBookings = filtered.filter((booking) =>
		booking.booking_date.startsWith(monthPrefix),
	);
	const monthEvents = filteredEvents.filter((event) =>
		event.event_date.startsWith(monthPrefix),
	);
	const bookedDates = new Set([
		...monthBookings.map((booking) => booking.booking_date),
		...monthEvents.map((event) => event.event_date),
	]);
	const selectedBookings = bookingsByDate.get(selectedDate) ?? [];
	const selectedEvents = eventsByDate.get(selectedDate) ?? [];

	const selectDate = useCallback(
		(next: string) => {
			setSelectedDate(next);
			navigate({
				to: "/admin/calendar",
				search: (previous) => ({ ...previous, date: next }),
				replace: true,
			});
		},
		[navigate],
	);

	const goToMonth = (next: Date) => {
		const target = startOfMonth(next);
		setMonth(target);
		selectDate(format(target, "yyyy-MM-dd"));
	};

	return (
		<div>
			<PageHeader
				eyebrow="Availability"
				title="Calendar"
				description={`${monthBookings.length} bookings · ${monthEvents.length} school ${monthEvents.length === 1 ? "event" : "events"} · ${bookedDates.size} ${bookedDates.size === 1 ? "date" : "dates"} in use.`}
				action={
					<div className="flex flex-wrap gap-2">
						<Select value={venueFilter} onValueChange={setVenueFilter}>
							<SelectTrigger className="w-44">
								<SelectValue placeholder="All venues" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All venues</SelectItem>
								{venues.map((venue) => (
									<SelectItem key={venue.id} value={venue.id}>
										{venue.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select
							value={statusFilter}
							onValueChange={(value) => setStatusFilter(value as StatusFilter)}
						>
							<SelectTrigger className="w-36">
								<SelectValue placeholder="Active" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="active">Active</SelectItem>
								<SelectItem value="all">All statuses</SelectItem>
								<SelectItem value="pending">Pending</SelectItem>
								<SelectItem value="approved">Approved</SelectItem>
								<SelectItem value="rejected">Rejected</SelectItem>
								<SelectItem value="cancelled">Cancelled</SelectItem>
							</SelectContent>
						</Select>
					</div>
				}
			/>

			<div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
				<Card className="border-border/70">
					<CardHeader className="flex-row items-center justify-between gap-3">
						<div>
							<CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
								{format(month, "MMMM yyyy")}
							</CardTitle>
							<CardDescription>
								School events are navy/gold and take priority. Click a date for
								details.
							</CardDescription>
						</div>
						<div className="flex items-center gap-1">
							<Button
								variant="outline"
								size="icon-sm"
								aria-label="Previous month"
								onClick={() => goToMonth(subMonths(month, 1))}
							>
								<ChevronLeft className="size-4" />
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									const today = new Date();
									setMonth(startOfMonth(today));
									selectDate(format(today, "yyyy-MM-dd"));
								}}
							>
								Today
							</Button>
							<Button
								variant="outline"
								size="icon-sm"
								aria-label="Next month"
								onClick={() => goToMonth(addMonths(month, 1))}
							>
								<ChevronRight className="size-4" />
							</Button>
						</div>
					</CardHeader>
					<CardContent>
						{loading ? (
							<Skeleton className="h-[480px] w-full rounded-xl xl:h-[560px]" />
						) : (
							<div className="overflow-x-auto">
								<div className="min-w-[640px] xl:min-w-0">
									<div className="grid grid-cols-7 border-b border-border/70 pb-2">
										{weekdayLabels.map((label) => (
											<div
												key={label}
												className="px-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
											>
												{label}
											</div>
										))}
									</div>
									<div className="grid grid-cols-7">
										{days.map((day) => {
											const key = format(day, "yyyy-MM-dd");
											const dayBookings = bookingsByDate.get(key) ?? [];
											const dayEvents = eventsByDate.get(key) ?? [];
											const visibleEvents = dayEvents.slice(0, 2);
											const visibleBookings = dayBookings.slice(
												0,
												Math.max(0, 2 - visibleEvents.length),
											);
											const totalItems = dayEvents.length + dayBookings.length;
											const inMonth = isSameMonth(day, month);
											const selected = key === selectedDate;
											const today = isToday(day);

											return (
												<button
													key={key}
													type="button"
													onClick={() => selectDate(key)}
													className={cn(
														"min-h-20 border-b border-r border-border/60 p-1.5 text-left align-top transition-colors hover:bg-[#2451d8]/5 dark:hover:bg-[#f0c75e]/5 sm:min-h-24 xl:min-h-20",
														!inMonth && "bg-muted/30 text-muted-foreground",
														selected &&
															"bg-[#2451d8]/10 ring-1 ring-inset ring-[#2451d8]/40 dark:bg-[#f0c75e]/10 dark:ring-[#f0c75e]/30",
													)}
												>
													<div className="flex items-center justify-between">
														<span
															className={cn(
																"grid size-6 place-items-center rounded-full text-xs font-semibold",
																today &&
																	"bg-[#2451d8] text-white dark:bg-[#f0c75e] dark:text-[#0b1f3a]",
															)}
														>
															{format(day, "d")}
														</span>
														{totalItems > 0 ? (
															<span className="text-[10px] font-semibold text-muted-foreground">
																{totalItems}
															</span>
														) : null}
													</div>
													<div className="mt-1 space-y-1">
														{visibleEvents.map((event) => (
															<div
																key={event.id}
																className="truncate rounded bg-[#0b1f3a] px-1 py-0.5 text-[10px] font-semibold text-[#f0c75e] dark:bg-[#f0c75e] dark:text-[#0b1f3a]"
																title={`School event: ${event.title} · ${event.venue?.name ?? "Venue"}`}
															>
																{event.title}
															</div>
														))}
														{visibleBookings.map((booking) => (
															<div
																key={booking.id}
																className={cn(
																	"truncate rounded px-1 py-0.5 text-[10px] font-medium",
																	chipStyles[booking.status],
																)}
																title={`${booking.activity_name} · ${booking.venue?.name ?? "Venue"}`}
															>
																{booking.venue?.name ?? booking.activity_name}
															</div>
														))}
														{totalItems >
														visibleEvents.length + visibleBookings.length ? (
															<div className="px-1 text-[10px] font-semibold text-muted-foreground">
																+
																{totalItems -
																	visibleEvents.length -
																	visibleBookings.length}{" "}
																more
															</div>
														) : null}
													</div>
												</button>
											);
										})}
									</div>
								</div>
							</div>
						)}
					</CardContent>
				</Card>

				<Card className="border-border/70 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
					<CardHeader className="flex-row items-start justify-between gap-3">
						<div>
							<CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
								{formatDate(selectedDate)}
							</CardTitle>
							<CardDescription>
								{selectedEvents.length === 0 && selectedBookings.length === 0
									? "No school events or bookings on this date."
									: `${selectedEvents.length} school ${selectedEvents.length === 1 ? "event" : "events"} · ${selectedBookings.length} ${selectedBookings.length === 1 ? "booking" : "bookings"}`}
							</CardDescription>
						</div>
						<div className="flex flex-wrap gap-2">
							<Link
								to="/admin/events"
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
									"no-underline",
								)}
							>
								Manage events
							</Link>
							<Link
								to="/admin/bookings"
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
									"no-underline",
								)}
							>
								Manage bookings
							</Link>
						</div>
					</CardHeader>
					<CardContent>
						{selectedEvents.length === 0 && selectedBookings.length === 0 ? (
							<div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 px-6 py-10 text-center">
								<CalendarDays className="size-6 text-muted-foreground" />
								<p className="mt-3 text-sm font-semibold">Date is free</p>
								<p className="mt-1 text-xs text-muted-foreground">
									There are no school events or matching bookings for this
									venue.
								</p>
							</div>
						) : (
							<div>
								{selectedEvents.length > 0 ? (
									<div className="mb-5 space-y-3">
										{selectedEvents.map((event) => (
											<div
												key={event.id}
												className="rounded-xl border border-[#f0c75e]/60 bg-[#f0c75e]/10 p-3"
											>
												<div className="flex flex-wrap items-center gap-2">
													<School className="size-4 text-[#a87a12] dark:text-[#f0c75e]" />
													<p className="font-semibold">{event.title}</p>
													<Badge
														variant="outline"
														className="border-[#f0c75e]/70 bg-[#f0c75e]/15 text-[#7a5709] dark:text-[#f0c75e]"
													>
														School event · Top priority
													</Badge>
												</div>
												<p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
													<span className="flex items-center gap-1">
														<MapPin className="size-3" />
														{event.venue?.name ?? "Unknown venue"}
													</span>
													<span className="flex items-center gap-1">
														<Clock className="size-3" />
														{event.start_time || event.end_time
															? formatTimeRange(
																	event.start_time,
																	event.end_time,
																)
															: "All day"}
													</span>
												</p>
												{event.description ? (
													<p className="mt-1 text-xs text-muted-foreground">
														{event.description}
													</p>
												) : null}
											</div>
										))}
									</div>
								) : null}
								{selectedBookings.length > 0 ? (
									<div className="divide-y divide-border/70">
										{selectedBookings.map((booking) => (
											<div
												key={booking.id}
												className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
											>
												<div className="min-w-0">
													<div className="flex flex-wrap items-center gap-2">
														<p className="font-semibold">
															{booking.activity_name}
														</p>
														<BookingStatusBadge status={booking.status} />
														{booking.is_auto_approved ? (
															<span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
																Auto
															</span>
														) : null}
													</div>
													<p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
														<span className="flex items-center gap-1">
															<MapPin className="size-3" />
															{booking.venue?.name ?? "Unknown venue"}
														</span>
														<span className="flex items-center gap-1">
															<Clock className="size-3" />
															{formatTimeRange(
																booking.start_time,
																booking.end_time,
															)}
														</span>
													</p>
													<p className="mt-1 text-xs text-muted-foreground">
														{booking.requester_name}
														{booking.organization_name
															? ` · ${booking.organization_name}`
															: ""}
													</p>
												</div>
												<div className="text-right">
													<p className="font-mono text-xs font-semibold text-muted-foreground">
														{booking.reference}
													</p>
													<Link
														to="/admin/bookings"
														className={cn(
															buttonVariants({ variant: "ghost", size: "sm" }),
															"mt-1 no-underline",
														)}
													>
														Review
													</Link>
												</div>
											</div>
										))}
									</div>
								) : null}
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
