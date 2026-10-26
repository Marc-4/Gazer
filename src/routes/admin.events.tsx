import { createFileRoute, Link } from "@tanstack/react-router";
import {
	CalendarDays,
	MoreHorizontal,
	Pencil,
	Plus,
	School,
	Search,
	Trash2,
	TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DataPagination } from "#/components/data-pagination";
import { EmptyState } from "#/components/empty-state";
import { FilterSelect } from "#/components/filter-select";
import { PageHeader } from "#/components/page-header";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Textarea } from "#/components/ui/textarea";
import {
	fetchSchoolEventCounts,
	fetchSchoolEventsPage,
	type SchoolEventFilter,
} from "#/lib/admin-queries";
import {
	DEFAULT_END_TIME,
	DEFAULT_START_TIME,
	formatDate,
	formatTimeRange,
	todayIsoDate,
} from "#/lib/format";
import { supabase } from "#/lib/supabase";
import type { SchoolEventWithVenue, Venue } from "#/lib/types";
import { useDebouncedValue } from "#/lib/use-debounced-value";

export const Route = createFileRoute("/admin/events")({
	component: AdminEvents,
});

interface EventFormState {
	title: string;
	venueId: string;
	eventDate: string;
	startTime: string;
	endTime: string;
	description: string;
}

function createEmptyForm(): EventFormState {
	return {
		title: "",
		venueId: "",
		eventDate: todayIsoDate(),
		startTime: DEFAULT_START_TIME,
		endTime: DEFAULT_END_TIME,
		description: "",
	};
}

function mapEventError(error: { code?: string; message?: string }) {
	if (error.code === "23514") {
		return "Check the event title and times. If provided, the end time must be after the start time.";
	}
	if (error.code === "23503") {
		return "That venue is no longer available.";
	}
	return error.message ?? "Unable to save the school event.";
}

function eventTimeLabel(event: SchoolEventWithVenue) {
	return event.start_time || event.end_time
		? formatTimeRange(event.start_time, event.end_time)
		: "All day";
}

function EventDialog({
	open,
	onOpenChange,
	event,
	venues,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	event: SchoolEventWithVenue | null;
	venues: Venue[];
	onSaved: () => Promise<void> | void;
}) {
	const [form, setForm] = useState<EventFormState>(createEmptyForm);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [conflictCount, setConflictCount] = useState<number | null>(null);

	useEffect(() => {
		if (!open) return;
		setForm(
			event
				? {
						title: event.title,
						venueId: event.venue_id,
						eventDate: event.event_date,
						startTime: event.start_time?.slice(0, 5) ?? "",
						endTime: event.end_time?.slice(0, 5) ?? "",
						description: event.description ?? "",
					}
				: createEmptyForm(),
		);
		setError(null);
		setConflictCount(null);
	}, [open, event]);

	useEffect(() => {
		let active = true;

		if (!open || !form.venueId || !form.eventDate) {
			setConflictCount(null);
			return () => {
				active = false;
			};
		}

		supabase
			.from("bookings")
			.select("*", { count: "exact", head: true })
			.eq("venue_id", form.venueId)
			.eq("booking_date", form.eventDate)
			.in("status", ["pending", "approved"])
			.then(({ count, error: countError }) => {
				if (!active) return;
				setConflictCount(countError ? null : (count ?? 0));
			});

		return () => {
			active = false;
		};
	}, [open, form.venueId, form.eventDate]);

	const update = <Key extends keyof EventFormState>(
		key: Key,
		value: EventFormState[Key],
	) => {
		setForm((current) => ({ ...current, [key]: value }));
	};

	const handleSubmit = async (submitEvent: React.FormEvent) => {
		submitEvent.preventDefault();
		if (!form.title.trim()) {
			setError("An event title is required.");
			return;
		}
		if (!form.venueId) {
			setError("Choose a venue.");
			return;
		}
		if (!form.eventDate) {
			setError("Choose an event date.");
			return;
		}
		if (!event && form.eventDate < todayIsoDate()) {
			setError("The event date cannot be in the past.");
			return;
		}
		if (Boolean(form.startTime) !== Boolean(form.endTime)) {
			setError("Provide both a start and end time, or leave both blank.");
			return;
		}
		if (form.startTime && form.endTime && form.endTime <= form.startTime) {
			setError("The end time must be after the start time.");
			return;
		}

		setSaving(true);
		setError(null);
		const payload = {
			title: form.title.trim(),
			venue_id: form.venueId,
			event_date: form.eventDate,
			start_time: form.startTime || null,
			end_time: form.endTime || null,
			description: form.description.trim() || null,
			updated_at: new Date().toISOString(),
		};

		const result = event
			? await supabase.from("school_events").update(payload).eq("id", event.id)
			: await supabase.from("school_events").insert(payload);

		if (result.error) {
			setError(mapEventError(result.error));
			setSaving(false);
			return;
		}

		toast.success(event ? "School event updated" : "School event created");
		setSaving(false);
		onOpenChange(false);
		await onSaved();
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>
							{event ? "Edit school event" : "Create school event"}
						</DialogTitle>
						<DialogDescription>
							School events have the highest priority and reserve their venue
							for the whole date. Multiple school events may share the same
							venue and date.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="event-title" required>
								Event title
							</Label>
							<Input
								id="event-title"
								value={form.title}
								onChange={(changeEvent) =>
									update("title", changeEvent.target.value)
								}
								placeholder="e.g. Foundation Day"
								required
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="event-venue" required>
								Venue
							</Label>
							<Select
								value={form.venueId}
								onValueChange={(value) => update("venueId", value)}
							>
								<SelectTrigger
									id="event-venue"
									className="w-full"
									aria-required="true"
								>
									<SelectValue placeholder="Choose a venue" />
								</SelectTrigger>
								<SelectContent>
									{venues.map((venue) => (
										<SelectItem key={venue.id} value={venue.id}>
											{venue.name}
											{venue.is_active ? "" : " (inactive)"}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="event-date" required>
								Date
							</Label>
							<Input
								id="event-date"
								type="date"
								min={event ? undefined : todayIsoDate()}
								value={form.eventDate}
								onChange={(changeEvent) =>
									update("eventDate", changeEvent.target.value)
								}
								required
							/>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="event-start">Start time</Label>
								<Input
									id="event-start"
									type="time"
									value={form.startTime}
									onChange={(changeEvent) =>
										update("startTime", changeEvent.target.value)
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="event-end">End time</Label>
								<Input
									id="event-end"
									type="time"
									value={form.endTime}
									onChange={(changeEvent) =>
										update("endTime", changeEvent.target.value)
									}
								/>
							</div>
						</div>
						<p className="text-xs text-muted-foreground">
							Times are for display. The whole venue and date are reserved
							regardless, and school events may overlap each other.
						</p>

						<div className="space-y-2">
							<Label htmlFor="event-description">Description</Label>
							<Textarea
								id="event-description"
								value={form.description}
								onChange={(changeEvent) =>
									update("description", changeEvent.target.value)
								}
								rows={3}
								placeholder="Optional context for the event."
							/>
						</div>

						<div className="flex items-start gap-3 rounded-xl border border-[#f0c75e]/60 bg-[#f0c75e]/15 px-4 py-3">
							<TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#a87a12] dark:text-[#f0c75e]" />
							<p className="text-xs leading-relaxed text-muted-foreground">
								<strong className="text-foreground">Top priority.</strong>{" "}
								Saving this event blocks new bookings for the venue and date.
								{conflictCount === null
									? " Any existing pending or approved bookings will be cancelled automatically."
									: conflictCount > 0
										? ` ${conflictCount} active ${conflictCount === 1 ? "booking" : "bookings"} will be cancelled automatically.`
										: " There are no active bookings for this venue and date."}
							</p>
						</div>

						{error ? (
							<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
								{error}
							</div>
						) : null}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={saving}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={saving}>
							{saving ? "Saving…" : event ? "Save changes" : "Create event"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function AdminEvents() {
	const [events, setEvents] = useState<SchoolEventWithVenue[]>([]);
	const [venues, setVenues] = useState<Venue[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState<SchoolEventFilter>("upcoming");
	const [query, setQuery] = useState("");
	const [venueFilter, setVenueFilter] = useState("all");
	const [eventDateFilter, setEventDateFilter] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [total, setTotal] = useState(0);
	const [totalAll, setTotalAll] = useState(0);
	const [upcomingCount, setUpcomingCount] = useState(0);
	const [refreshKey, setRefreshKey] = useState(0);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<SchoolEventWithVenue | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<SchoolEventWithVenue | null>(
		null,
	);
	const debouncedQuery = useDebouncedValue(query);

	useEffect(() => {
		let active = true;

		supabase
			.from("venues")
			.select("*")
			.order("name")
			.then(({ data, error }) => {
				if (!active) return;
				if (error) {
					toast.error(error.message);
					return;
				}
				setVenues((data as Venue[] | null) ?? []);
			});

		return () => {
			active = false;
		};
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey intentionally retriggers the query after mutations.
	useEffect(() => {
		let active = true;
		setLoading(true);

		Promise.all([
			fetchSchoolEventsPage({
				page,
				pageSize,
				filter,
				query: debouncedQuery,
				venueId: venueFilter,
				eventDate: eventDateFilter,
			}),
			fetchSchoolEventCounts(),
		])
			.then(([result, counts]) => {
				if (!active) return;
				const pageCount = Math.max(1, Math.ceil(result.total / pageSize));
				if (page > pageCount) {
					setPage(pageCount);
					return;
				}
				setEvents(result.rows);
				setTotal(result.total);
				setTotalAll(counts.total);
				setUpcomingCount(counts.upcoming);
				setLoading(false);
			})
			.catch((error: unknown) => {
				if (!active) return;
				toast.error(
					error instanceof Error
						? error.message
						: "Unable to load school events.",
				);
				setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [
		page,
		pageSize,
		filter,
		debouncedQuery,
		venueFilter,
		eventDateFilter,
		refreshKey,
	]);

	const refresh = () => setRefreshKey((key) => key + 1);

	const removeEvent = async (event: SchoolEventWithVenue) => {
		const { error } = await supabase
			.from("school_events")
			.delete()
			.eq("id", event.id);

		if (error) {
			toast.error(error.message);
			return;
		}

		toast.success("School event deleted");
		refresh();
	};

	return (
		<div>
			<PageHeader
				eyebrow="Priority scheduling"
				title="School events"
				description={`${totalAll} total · ${upcomingCount} upcoming. These events override regular bookings for their venue and date and may overlap one another.`}
				action={
					<Button
						onClick={() => {
							setEditing(null);
							setDialogOpen(true);
						}}
						disabled={venues.length === 0}
					>
						<Plus className="size-4" />
						Create event
					</Button>
				}
			/>

			<Card className="mt-6 border-border/70">
				<CardHeader className="gap-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
								Priority calendar blocks
							</CardTitle>
							<CardDescription>
								{total} of {totalAll} events · Creating or moving a school event
								cancels conflicting pending and approved bookings automatically.
							</CardDescription>
						</div>
						<div className="relative w-full sm:w-72">
							<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={query}
								onChange={(event) => {
									setQuery(event.target.value);
									setPage(1);
								}}
								placeholder="Search title, venue, description…"
								className="pl-9"
							/>
						</div>
					</div>
					<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
						<Tabs
							value={filter}
							onValueChange={(value) => {
								setFilter(value as SchoolEventFilter);
								setPage(1);
							}}
						>
							<TabsList>
								<TabsTrigger value="upcoming">Upcoming</TabsTrigger>
								<TabsTrigger value="all">All</TabsTrigger>
								<TabsTrigger value="past">Past</TabsTrigger>
							</TabsList>
						</Tabs>
						<div className="flex flex-wrap items-center gap-2">
							<FilterSelect
								value={venueFilter}
								onValueChange={(value) => {
									setVenueFilter(value);
									setPage(1);
								}}
								options={[
									{ value: "all", label: "All venues" },
									...venues.map((venue) => ({
										value: venue.id,
										label: venue.name,
									})),
								]}
								ariaLabel="Filter school events by venue"
							/>
							<Input
								type="date"
								value={eventDateFilter}
								onChange={(event) => {
									setEventDateFilter(event.target.value);
									setPage(1);
								}}
								aria-label="Filter school events by event date"
								className="w-full sm:w-44"
							/>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className="space-y-2">
							{["s1", "s2", "s3", "s4"].map((key) => (
								<Skeleton key={key} className="h-14 rounded-lg" />
							))}
						</div>
					) : total === 0 ? (
						<EmptyState
							icon={School}
							title={
								totalAll === 0
									? "No school events yet"
									: "No school events found"
							}
							description={
								totalAll === 0
									? venues.length === 0
										? "Create a venue first, then reserve it for a school event."
										: "Reserve a venue for a school event to block regular bookings on that date."
									: "Try a different filter or search term."
							}
							action={
								venues.length > 0 ? (
									<Button
										onClick={() => {
											setEditing(null);
											setDialogOpen(true);
										}}
									>
										<Plus className="size-4" />
										Create event
									</Button>
								) : undefined
							}
						/>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Event</TableHead>
										<TableHead>Venue</TableHead>
										<TableHead>Date</TableHead>
										<TableHead>Time</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{events.map((event) => (
										<TableRow key={event.id}>
											<TableCell className="max-w-64">
												<p className="truncate font-semibold">{event.title}</p>
												{event.description ? (
													<p className="line-clamp-1 text-xs text-muted-foreground">
														{event.description}
													</p>
												) : null}
											</TableCell>
											<TableCell className="max-w-48">
												{event.venue ? (
													<Link
														to="/admin/venues"
														search={{ venue: event.venue.id }}
														className="block truncate font-semibold underline-offset-4 hover:underline"
													>
														{event.venue.name}
													</Link>
												) : (
													<p className="truncate font-semibold">
														Unknown venue
													</p>
												)}
												{event.venue?.address ? (
													<p className="truncate text-xs text-muted-foreground">
														{event.venue.address}
													</p>
												) : null}
											</TableCell>
											<TableCell>
												<Link
													to="/admin/calendar"
													search={{ date: event.event_date }}
													className="flex items-center gap-1.5 underline-offset-4 hover:underline"
												>
													<CalendarDays className="size-3.5 text-muted-foreground" />
													{formatDate(event.event_date)}
												</Link>
											</TableCell>
											<TableCell className="text-xs">
												<Link
													to="/admin/calendar"
													search={{ date: event.event_date }}
													className="underline-offset-4 hover:underline"
												>
													{eventTimeLabel(event)}
												</Link>
											</TableCell>
											<TableCell className="text-right">
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															size="icon"
															aria-label={`Actions for ${event.title}`}
														>
															<MoreHorizontal className="size-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															onSelect={() => {
																setEditing(event);
																setDialogOpen(true);
															}}
														>
															<Pencil className="size-4" />
															Edit event
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															onSelect={() => setDeleteTarget(event)}
															className="text-destructive focus:text-destructive"
														>
															<Trash2 className="size-4" />
															Delete event
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
					{!loading && total > 0 ? (
						<DataPagination
							page={page}
							pageSize={pageSize}
							total={total}
							itemLabel="school events"
							onPageChange={setPage}
							onPageSizeChange={(size) => {
								setPageSize(size);
								setPage(1);
							}}
						/>
					) : null}
				</CardContent>
			</Card>

			<EventDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				event={editing}
				venues={venues}
				onSaved={() => {
					setPage(1);
					refresh();
				}}
			/>

			<AlertDialog
				open={Boolean(deleteTarget)}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Delete {deleteTarget?.title ?? "school event"}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							The venue and date will become bookable again. Bookings that were
							already cancelled because of this event will not be restored.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (deleteTarget) removeEvent(deleteTarget);
							}}
						>
							Delete event
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
