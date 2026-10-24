import { createFileRoute, Link } from "@tanstack/react-router";
import {
	CalendarDays,
	Check,
	Loader2,
	Plus,
	Search,
	Users,
	X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AvailabilityCalendar } from "#/components/availability-calendar";
import { DataPagination } from "#/components/data-pagination";
import { EmptyState } from "#/components/empty-state";
import { PageHeader } from "#/components/page-header";
import { BookingStatusBadge } from "#/components/status-badge";
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
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Separator } from "#/components/ui/separator";
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
	type BookingFilter,
	countBookings,
	fetchBookingById,
	fetchBookingsPage,
} from "#/lib/admin-queries";
import { useAuth } from "#/lib/auth";
import {
	filterAvailabilityForVenue,
	isAvailabilityBlocked,
} from "#/lib/availability";
import {
	DEFAULT_START_TIME,
	formatDate,
	formatDateTime,
	formatTimeRange,
	todayIsoDate,
} from "#/lib/format";
import { supabase } from "#/lib/supabase";
import type { AvailabilityEntry, BookingWithVenue, Venue } from "#/lib/types";
import { useDebouncedValue } from "#/lib/use-debounced-value";

interface AdminBookingsSearch {
	review?: string;
}

export const Route = createFileRoute("/admin/bookings")({
	validateSearch: (search: Record<string, unknown>): AdminBookingsSearch => ({
		review:
			typeof search.review === "string" && search.review
				? search.review
				: undefined,
	}),
	component: AdminBookings,
});

const filters: Array<{ value: BookingFilter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "pending", label: "Pending" },
	{ value: "approved", label: "Approved" },
	{ value: "rejected", label: "Rejected" },
	{ value: "cancelled", label: "Cancelled" },
];

interface NewBookingFormState {
	venueId: string;
	bookingDate: string;
	startTime: string;
	endTime: string;
	activityName: string;
	activityDescription: string;
	organizationName: string;
	requesterName: string;
	requesterEmail: string;
	requesterPhone: string;
	attendeeCount: string;
	status: "pending" | "approved";
	decisionNote: string;
}

function createEmptyNewBookingForm(): NewBookingFormState {
	return {
		venueId: "",
		bookingDate: todayIsoDate(),
		startTime: DEFAULT_START_TIME,
		endTime: "",
		activityName: "",
		activityDescription: "",
		organizationName: "",
		requesterName: "",
		requesterEmail: "",
		requesterPhone: "",
		attendeeCount: "",
		status: "pending",
		decisionNote: "",
	};
}

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function mapNewBookingError(error: { code?: string; message?: string }) {
	const message = error.message?.toLowerCase() ?? "";
	if (message.includes("school event")) {
		return "This venue is reserved for a school event on the selected date. Choose another venue or date.";
	}
	if (error.code === "23P01") {
		return "This venue already has a pending or approved booking during the selected time.";
	}
	if (error.code === "23505") {
		return "This venue already has a pending or approved booking during the selected time.";
	}
	if (error.code === "23514") {
		return "Some details are invalid. Check the times, attendee count, and email address.";
	}
	if (error.code === "23503") {
		return "That venue is no longer available.";
	}
	return error.message ?? "Unable to create the booking.";
}

function mapBookingActionError(error: { code?: string; message?: string }) {
	if (error.code === "23P01") {
		return "This venue is already booked during the selected time.";
	}
	if (error.message?.toLowerCase().includes("school event")) {
		return "This venue is reserved for a school event on the selected date.";
	}
	return error.message ?? "Unable to update the booking.";
}

function NewBookingDialog({
	open,
	onOpenChange,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => Promise<void> | void;
}) {
	const { profile } = useAuth();
	const [form, setForm] = useState<NewBookingFormState>(
		createEmptyNewBookingForm,
	);
	const [venues, setVenues] = useState<Venue[]>([]);
	const [loadingVenues, setLoadingVenues] = useState(false);
	const [saving, setSaving] = useState(false);
	const [availability, setAvailability] = useState<{
		venueId: string;
		date: string;
		entries: AvailabilityEntry[];
		loading: boolean;
	}>({ venueId: "", date: "", entries: [], loading: false });
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;

		let active = true;
		setForm(createEmptyNewBookingForm());
		setAvailability({ venueId: "", date: "", entries: [], loading: false });
		setError(null);
		setSaving(false);
		setLoadingVenues(true);

		supabase
			.from("venues")
			.select("*")
			.eq("is_active", true)
			.order("name")
			.then(({ data, error: venuesError }) => {
				if (!active) return;

				if (venuesError) {
					toast.error(venuesError.message);
					setVenues([]);
					setLoadingVenues(false);
					return;
				}

				const nextVenues = (data as Venue[] | null) ?? [];
				setVenues(nextVenues);
				if (nextVenues.length === 1) {
					setForm((current) => ({
						...current,
						venueId: current.venueId || nextVenues[0].id,
					}));
				}
				setLoadingVenues(false);
			});

		return () => {
			active = false;
		};
	}, [open]);

	const update = <Key extends keyof NewBookingFormState>(
		key: Key,
		value: NewBookingFormState[Key],
	) => {
		setForm((current) => ({ ...current, [key]: value }));
	};

	const handleDayAvailabilityChange = useCallback(
		(date: string, entries: AvailabilityEntry[], loading: boolean) => {
			setAvailability({ venueId: form.venueId, date, entries, loading });
		},
		[form.venueId],
	);

	const availabilityReady =
		Boolean(form.venueId && form.bookingDate) &&
		availability.venueId === form.venueId &&
		availability.date === form.bookingDate;
	const checkingAvailability =
		Boolean(form.venueId && form.bookingDate) &&
		(!availabilityReady || availability.loading);
	const selectedAvailability = availabilityReady
		? filterAvailabilityForVenue(availability.entries, form.venueId)
		: [];
	const isUnavailable = isAvailabilityBlocked(
		selectedAvailability,
		form.startTime,
		form.endTime,
	);
	const hasSelectedTime = Boolean(form.startTime && form.endTime);
	const selectedVenue =
		venues.find((venue) => venue.id === form.venueId) ?? null;

	const handleSubmit = async (submitEvent: React.FormEvent) => {
		submitEvent.preventDefault();
		if (!form.venueId) {
			setError("Choose a venue.");
			return;
		}
		if (!form.bookingDate) {
			setError("Choose a booking date.");
			return;
		}
		if (form.bookingDate < todayIsoDate()) {
			setError("The booking date cannot be in the past.");
			return;
		}
		if (checkingAvailability) {
			setError("Checking availability. Please try again in a moment.");
			return;
		}
		if (isUnavailable) {
			setError(
				hasSelectedTime
					? "This venue is already reserved during the selected time. Choose another time, venue, or date."
					: "This venue is already reserved for the selected date. Choose another venue or date.",
			);
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
		if (!form.activityName.trim()) {
			setError("Activity name is required.");
			return;
		}
		if (!form.requesterName.trim()) {
			setError("Requester name is required.");
			return;
		}
		if (!emailPattern.test(form.requesterEmail.trim())) {
			setError("Enter a valid requester email address.");
			return;
		}
		if (
			form.attendeeCount.trim() &&
			(!Number.isInteger(Number(form.attendeeCount)) ||
				Number(form.attendeeCount) <= 0)
		) {
			setError("Attendee count must be a positive whole number.");
			return;
		}

		setSaving(true);
		setError(null);
		const now = new Date().toISOString();
		const { error: insertError } = await supabase.from("bookings").insert({
			public_token: crypto.randomUUID(),
			user_id: null,
			venue_id: form.venueId,
			booking_date: form.bookingDate,
			start_time: form.startTime || null,
			end_time: form.endTime || null,
			status: form.status,
			activity_name: form.activityName.trim(),
			activity_description: form.activityDescription.trim() || null,
			organization_name: form.organizationName.trim() || null,
			requester_name: form.requesterName.trim(),
			requester_email: form.requesterEmail.trim().toLowerCase(),
			requester_phone: form.requesterPhone.trim() || null,
			attendee_count: form.attendeeCount.trim()
				? Number(form.attendeeCount)
				: null,
			decision_note:
				form.status === "approved" ? form.decisionNote.trim() || null : null,
			decided_by: form.status === "approved" ? (profile?.id ?? null) : null,
			decided_at: form.status === "approved" ? now : null,
		});

		if (insertError) {
			setError(mapNewBookingError(insertError));
			setSaving(false);
			return;
		}

		toast.success("Booking created");
		setSaving(false);
		onOpenChange(false);
		await onSaved();
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Create booking</DialogTitle>
						<DialogDescription>
							Create a booking on behalf of a requester. Existing availability
							and school event rules still apply.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="admin-booking-venue" required>
									Venue
								</Label>
								<Select
									value={form.venueId}
									onValueChange={(value) => update("venueId", value)}
								>
									<SelectTrigger
										id="admin-booking-venue"
										className="w-full"
										aria-required="true"
									>
										<SelectValue
											placeholder={
												loadingVenues
													? "Loading venues…"
													: venues.length === 0
														? "No active venues"
														: "Choose a venue"
											}
										/>
									</SelectTrigger>
									<SelectContent>
										{venues.map((venue) => (
											<SelectItem key={venue.id} value={venue.id}>
												{venue.name}
												{venue.capacity ? ` · ${venue.capacity} seats` : ""}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label htmlFor="admin-booking-date" required>
									Date
								</Label>
								<Input
									id="admin-booking-date"
									type="date"
									min={todayIsoDate()}
									value={form.bookingDate}
									onChange={(changeEvent) =>
										update("bookingDate", changeEvent.target.value)
									}
									required
								/>
							</div>
						</div>

						{isUnavailable ? (
							<div className="rounded-lg border border-rose-300/60 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-100">
								{hasSelectedTime
									? "This venue is already reserved during the selected time. Choose another time, venue, or date."
									: "This venue is already reserved for the selected date. Choose another venue or date."}
							</div>
						) : null}

						<AvailabilityCalendar
							compact
							embedded
							venueId={form.venueId || null}
							venueName={selectedVenue?.name ?? null}
							selectedDate={form.bookingDate}
							selectedStartTime={form.startTime}
							selectedEndTime={form.endTime}
							onSelectDate={(date) => update("bookingDate", date)}
							onDayAvailabilityChange={handleDayAvailabilityChange}
						/>

						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="admin-booking-start">Start time</Label>
								<Input
									id="admin-booking-start"
									type="time"
									value={form.startTime}
									onChange={(changeEvent) =>
										update("startTime", changeEvent.target.value)
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="admin-booking-end">End time</Label>
								<Input
									id="admin-booking-end"
									type="time"
									value={form.endTime}
									onChange={(changeEvent) =>
										update("endTime", changeEvent.target.value)
									}
								/>
							</div>
						</div>
						<p className="text-xs text-muted-foreground">
							Optional. Leave both blank if the time is not decided yet.
						</p>

						<div className="space-y-2">
							<Label htmlFor="admin-booking-activity" required>
								Activity name
							</Label>
							<Input
								id="admin-booking-activity"
								value={form.activityName}
								onChange={(changeEvent) =>
									update("activityName", changeEvent.target.value)
								}
								placeholder="e.g. Science Fair"
								required
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="admin-booking-description">
								Activity description
							</Label>
							<Textarea
								id="admin-booking-description"
								value={form.activityDescription}
								onChange={(changeEvent) =>
									update("activityDescription", changeEvent.target.value)
								}
								rows={3}
								placeholder="Optional details about the activity."
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="admin-booking-organization">Organization</Label>
							<Input
								id="admin-booking-organization"
								value={form.organizationName}
								onChange={(changeEvent) =>
									update("organizationName", changeEvent.target.value)
								}
								placeholder="Optional"
							/>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="admin-booking-requester" required>
									Requester name
								</Label>
								<Input
									id="admin-booking-requester"
									value={form.requesterName}
									onChange={(changeEvent) =>
										update("requesterName", changeEvent.target.value)
									}
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="admin-booking-email" required>
									Requester email
								</Label>
								<Input
									id="admin-booking-email"
									type="email"
									value={form.requesterEmail}
									onChange={(changeEvent) =>
										update("requesterEmail", changeEvent.target.value)
									}
									required
								/>
							</div>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="admin-booking-phone">Requester phone</Label>
								<Input
									id="admin-booking-phone"
									type="tel"
									value={form.requesterPhone}
									onChange={(changeEvent) =>
										update("requesterPhone", changeEvent.target.value)
									}
									placeholder="Optional"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="admin-booking-attendees">Attendees</Label>
								<Input
									id="admin-booking-attendees"
									type="number"
									min={1}
									step={1}
									value={form.attendeeCount}
									onChange={(changeEvent) =>
										update("attendeeCount", changeEvent.target.value)
									}
									placeholder="Optional"
								/>
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="admin-booking-status">Status</Label>
							<Select
								value={form.status}
								onValueChange={(value) =>
									update("status", value as NewBookingFormState["status"])
								}
							>
								<SelectTrigger id="admin-booking-status" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="pending">Pending review</SelectItem>
									<SelectItem value="approved">Approved</SelectItem>
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								Pending bookings may be approved automatically during an open
								season.
							</p>
						</div>

						{form.status === "approved" ? (
							<div className="space-y-2">
								<Label htmlFor="admin-booking-note">
									Approval note (optional)
								</Label>
								<Textarea
									id="admin-booking-note"
									value={form.decisionNote}
									onChange={(changeEvent) =>
										update("decisionNote", changeEvent.target.value)
									}
									rows={3}
									placeholder="Included in the booker email."
								/>
							</div>
						) : null}

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
						<Button
							type="submit"
							disabled={
								saving ||
								loadingVenues ||
								venues.length === 0 ||
								checkingAvailability ||
								isUnavailable
							}
						>
							{saving ? "Creating…" : "Create booking"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function AdminBookings() {
	const [bookings, setBookings] = useState<BookingWithVenue[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState<BookingFilter>("all");
	const [query, setQuery] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [total, setTotal] = useState(0);
	const [totalAll, setTotalAll] = useState(0);
	const [refreshKey, setRefreshKey] = useState(0);
	const [selected, setSelected] = useState<BookingWithVenue | null>(null);
	const [note, setNote] = useState("");
	const [acting, setActing] = useState<string | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const debouncedQuery = useDebouncedValue(query);
	const { review } = Route.useSearch();
	const navigate = Route.useNavigate();

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey intentionally retriggers the query after mutations.
	useEffect(() => {
		let active = true;
		setLoading(true);

		Promise.all([
			fetchBookingsPage({ page, pageSize, filter, query: debouncedQuery }),
			countBookings(),
		])
			.then(([result, allCount]) => {
				if (!active) return;
				const pageCount = Math.max(1, Math.ceil(result.total / pageSize));
				if (page > pageCount) {
					setPage(pageCount);
					return;
				}
				setBookings(result.rows);
				setTotal(result.total);
				setTotalAll(allCount);
				setLoading(false);
			})
			.catch((error: unknown) => {
				if (!active) return;
				toast.error(
					error instanceof Error ? error.message : "Unable to load bookings.",
				);
				setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [page, pageSize, filter, debouncedQuery, refreshKey]);

	useEffect(() => {
		setNote(selected?.decision_note ?? "");
	}, [selected]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: navigate is stable; review is the trigger.
	useEffect(() => {
		if (!review) return;

		let active = true;
		fetchBookingById(review)
			.then((booking) => {
				if (!active) return;
				if (!booking) {
					toast.error("That booking could not be found.");
					navigate({
						to: "/admin/bookings",
						search: { review: undefined },
						replace: true,
					});
					return;
				}
				setSelected(booking);
			})
			.catch((error: unknown) => {
				if (!active) return;
				toast.error(
					error instanceof Error ? error.message : "Unable to load booking.",
				);
				navigate({
					to: "/admin/bookings",
					search: { review: undefined },
					replace: true,
				});
			});

		return () => {
			active = false;
		};
	}, [review]);

	const refresh = () => setRefreshKey((key) => key + 1);

	const closeSelected = () => {
		setSelected(null);
		if (review) {
			navigate({
				to: "/admin/bookings",
				search: { review: undefined },
				replace: true,
			});
		}
	};

	const runAction = async (
		action: "approve" | "reject" | "cancel",
		booking: BookingWithVenue,
	) => {
		setActing(action);
		const rpc =
			action === "approve"
				? supabase.rpc("approve_booking", {
						p_booking_id: booking.id,
						p_note: note.trim() || null,
					})
				: action === "reject"
					? supabase.rpc("reject_booking", {
							p_booking_id: booking.id,
							p_note: note.trim() || null,
						})
					: supabase.rpc("cancel_my_booking", {
							p_booking_id: booking.id,
							p_note: note.trim() || null,
						});

		const { error } = await rpc;
		setActing(null);

		if (error) {
			toast.error(mapBookingActionError(error));
			return;
		}

		const messages = {
			approve: "Booking approved",
			reject: "Booking rejected",
			cancel: "Booking cancelled",
		};
		toast.success(messages[action]);
		closeSelected();
		refresh();
	};

	return (
		<div>
			<PageHeader
				eyebrow="Request management"
				title="Bookings"
				description="Create bookings manually, approve or reject pending requests, and review history."
				action={
					<Button onClick={() => setCreateOpen(true)}>
						<Plus className="size-4" />
						New booking
					</Button>
				}
			/>

			<Card className="mt-6 border-border/70">
				<CardHeader className="gap-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
								All requests
							</CardTitle>
							<CardDescription>
								{total} of {totalAll} bookings
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
								placeholder="Search reference, name, venue…"
								className="pl-9"
							/>
						</div>
					</div>
					<Tabs
						value={filter}
						onValueChange={(value) => {
							setFilter(value as BookingFilter);
							setPage(1);
						}}
					>
						<TabsList className="w-full justify-start overflow-x-auto">
							{filters.map((item) => (
								<TabsTrigger key={item.value} value={item.value}>
									{item.label}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className="space-y-2">
							{["s1", "s2", "s3", "s4", "s5", "s6"].map((key) => (
								<Skeleton key={key} className="h-14 rounded-lg" />
							))}
						</div>
					) : total === 0 ? (
						<EmptyState
							icon={CalendarDays}
							title="No bookings found"
							description={
								totalAll === 0
									? "New booking requests will appear here."
									: "Try a different status filter or search term."
							}
						/>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Reference</TableHead>
										<TableHead>Activity</TableHead>
										<TableHead>Venue</TableHead>
										<TableHead>Date &amp; time</TableHead>
										<TableHead>Status</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{bookings.map((booking) => (
										<TableRow key={booking.id}>
											<TableCell>
												<Link
													to="/admin/bookings"
													search={{ review: booking.id }}
													className="font-mono text-xs font-semibold underline-offset-4 hover:underline"
												>
													{booking.reference}
												</Link>
												<p className="mt-0.5 text-[11px] text-muted-foreground">
													{formatDateTime(booking.created_at)}
												</p>
											</TableCell>
											<TableCell className="max-w-56">
												<p className="truncate font-medium">
													{booking.activity_name}
												</p>
												<p className="truncate text-xs text-muted-foreground">
													{booking.requester_name}
													{booking.organization_name
														? ` · ${booking.organization_name}`
														: ""}
												</p>
											</TableCell>
											<TableCell className="max-w-40">
												{booking.venue ? (
													<Link
														to="/admin/venues"
														search={{ venue: booking.venue.id }}
														className="block truncate text-sm underline-offset-4 hover:underline"
													>
														{booking.venue.name}
													</Link>
												) : (
													<p className="truncate text-sm">Unknown</p>
												)}
												{booking.attendee_count ? (
													<p className="flex items-center gap-1 text-xs text-muted-foreground">
														<Users className="size-3" />
														{booking.attendee_count}
													</p>
												) : null}
											</TableCell>
											<TableCell>
												<Link
													to="/admin/calendar"
													search={{ date: booking.booking_date }}
													className="block underline-offset-4 hover:underline"
												>
													<p className="text-sm">
														{formatDate(booking.booking_date)}
													</p>
													<p className="text-xs text-muted-foreground">
														{formatTimeRange(
															booking.start_time,
															booking.end_time,
														)}
													</p>
												</Link>
											</TableCell>
											<TableCell>
												<div className="flex flex-col items-start gap-1">
													<BookingStatusBadge status={booking.status} />
													{booking.is_auto_approved ? (
														<span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
															Auto
														</span>
													) : null}
												</div>
											</TableCell>
											<TableCell className="text-right">
												<Button
													variant="outline"
													size="sm"
													onClick={() => setSelected(booking)}
												>
													Review
												</Button>
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
							itemLabel="bookings"
							onPageChange={setPage}
							onPageSizeChange={(size) => {
								setPageSize(size);
								setPage(1);
							}}
						/>
					) : null}
				</CardContent>
			</Card>

			<NewBookingDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				onSaved={() => {
					setPage(1);
					refresh();
				}}
			/>

			<Dialog
				open={Boolean(selected)}
				onOpenChange={(open) => {
					if (!open) closeSelected();
				}}
			>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
					{selected ? (
						<>
							<DialogHeader>
								<div className="flex flex-wrap items-center gap-2">
									<DialogTitle className="font-mono text-sm">
										{selected.reference}
									</DialogTitle>
									<BookingStatusBadge status={selected.status} />
									{selected.is_auto_approved ? (
										<span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
											Auto-approved
										</span>
									) : null}
								</div>
								<DialogDescription>
									Submitted {formatDateTime(selected.created_at)} by{" "}
									{selected.requester_name}
								</DialogDescription>
							</DialogHeader>

							<div className="space-y-4">
								<div>
									<h3 className="font-[Fraunces,Georgia,serif] text-xl font-bold">
										{selected.activity_name}
									</h3>
									{selected.activity_description ? (
										<p className="mt-1 text-sm text-muted-foreground">
											{selected.activity_description}
										</p>
									) : null}
								</div>

								<Separator />

								<div className="grid gap-3 text-sm sm:grid-cols-2">
									<div>
										<p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
											Venue
										</p>
										<p className="mt-0.5 font-medium">
											{selected.venue?.name ?? "Unknown"}
										</p>
										{selected.venue?.address ? (
											<p className="text-xs text-muted-foreground">
												{selected.venue.address}
											</p>
										) : null}
									</div>
									<div>
										<p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
											Date &amp; time
										</p>
										<p className="mt-0.5 font-medium">
											{formatDate(selected.booking_date)}
										</p>
										<p className="text-xs text-muted-foreground">
											{formatTimeRange(selected.start_time, selected.end_time)}
										</p>
									</div>
									<div>
										<p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
											Contact
										</p>
										<p className="mt-0.5 font-medium">
											{selected.requester_email}
										</p>
										<p className="text-xs text-muted-foreground">
											{selected.requester_phone || "No phone"}
										</p>
									</div>
									<div>
										<p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
											Organization
										</p>
										<p className="mt-0.5 font-medium">
											{selected.organization_name || "—"}
										</p>
										<p className="text-xs text-muted-foreground">
											{selected.attendee_count
												? `${selected.attendee_count} attendees`
												: "Attendees not specified"}
										</p>
									</div>
								</div>

								{selected.status === "pending" ||
								selected.status === "approved" ? (
									<div className="space-y-2">
										<Label htmlFor="decision-note">
											{selected.status === "pending"
												? "Decision note (optional)"
												: "Cancellation note (optional)"}
										</Label>
										<Textarea
											id="decision-note"
											value={note}
											onChange={(event) => setNote(event.target.value)}
											placeholder="Add context for the booker. This is included in the email."
											rows={3}
										/>
									</div>
								) : selected.decision_note ? (
									<div className="rounded-lg border border-border/70 bg-muted/50 p-3">
										<p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
											Decision note
										</p>
										<p className="mt-1 text-sm">{selected.decision_note}</p>
									</div>
								) : null}
							</div>

							<DialogFooter className="gap-2 sm:justify-between">
								<Button
									variant="outline"
									onClick={() => setSelected(null)}
									disabled={Boolean(acting)}
								>
									Close
								</Button>
								<div className="flex flex-wrap gap-2">
									{selected.status === "pending" ? (
										<>
											<Button
												variant="destructive"
												onClick={() => runAction("reject", selected)}
												disabled={Boolean(acting)}
											>
												{acting === "reject" ? (
													<Loader2 className="size-4 animate-spin" />
												) : (
													<X className="size-4" />
												)}
												Reject
											</Button>
											<Button
												onClick={() => runAction("approve", selected)}
												disabled={Boolean(acting)}
											>
												{acting === "approve" ? (
													<Loader2 className="size-4 animate-spin" />
												) : (
													<Check className="size-4" />
												)}
												Approve
											</Button>
										</>
									) : null}
									{selected.status === "approved" ? (
										<Button
											variant="destructive"
											onClick={() => runAction("cancel", selected)}
											disabled={Boolean(acting)}
										>
											{acting === "cancel" ? (
												<Loader2 className="size-4 animate-spin" />
											) : (
												<X className="size-4" />
											)}
											Cancel booking
										</Button>
									) : null}
								</div>
							</DialogFooter>
						</>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}
