import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ArrowLeft,
	Building2,
	CalendarDays,
	CheckCircle2,
	Clock,
	MapPin,
	School,
	Send,
	Sparkles,
	TriangleAlert,
	Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AvailabilityCalendar } from "#/components/availability-calendar";
import { PageHeader } from "#/components/page-header";
import { Button, buttonVariants } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
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
import { Textarea } from "#/components/ui/textarea";
import { useAuth } from "#/lib/auth";
import {
	availabilityConflicts,
	filterAvailabilityForVenue,
} from "#/lib/availability";
import { bookingUserMessage, ensureBookingUser } from "#/lib/booking-user";
import {
	DEFAULT_END_TIME,
	DEFAULT_START_TIME,
	formatDate,
	formatTimeRange,
	todayIsoDate,
} from "#/lib/format";
import { supabase } from "#/lib/supabase";
import type {
	AvailabilityEntry,
	BookingFormValues,
	OpenSeason,
	Venue,
} from "#/lib/types";
import { cn } from "#/lib/utils";

interface BookSearch {
	venue?: string;
}

export const Route = createFileRoute("/book")({
	validateSearch: (search: Record<string, unknown>): BookSearch => ({
		venue:
			typeof search.venue === "string" && search.venue
				? search.venue
				: undefined,
	}),
	component: BookPage,
});

function createEmptyForm(venueId = ""): BookingFormValues {
	return {
		venueId,
		bookingDate: todayIsoDate(),
		startTime: DEFAULT_START_TIME,
		endTime: DEFAULT_END_TIME,
		activityName: "",
		activityDescription: "",
		organizationName: "",
		requesterName: "",
		requesterEmail: "",
		requesterPhone: "",
		attendeeCount: "",
	};
}

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function validate(values: BookingFormValues) {
	if (!values.venueId) return "Please choose a venue.";
	if (!values.bookingDate) return "Please choose a booking date.";
	if (values.bookingDate < todayIsoDate())
		return "The booking date cannot be in the past.";
	if (Boolean(values.startTime) !== Boolean(values.endTime))
		return "Provide both a start and end time, or leave both blank.";
	if (values.startTime && values.endTime && values.endTime <= values.startTime)
		return "The end time must be after the start time.";
	if (!values.activityName.trim()) return "Activity name is required.";
	if (!values.requesterName.trim()) return "Your name is required.";
	if (!emailPattern.test(values.requesterEmail.trim()))
		return "Enter a valid email address.";
	if (
		values.attendeeCount.trim() &&
		(!Number.isInteger(Number(values.attendeeCount)) ||
			Number(values.attendeeCount) <= 0)
	)
		return "Attendee count must be a positive whole number.";
	return null;
}

function mapInsertError(error: { code?: string; message?: string }) {
	if (error.message?.toLowerCase().includes("school event")) {
		return "This venue is reserved for a school event on the selected date. Choose another venue or date.";
	}
	if (error.code === "23P01") {
		return "That venue is already booked during the selected time. Please choose another time, date, or venue.";
	}
	if (error.code === "23505") {
		return "That venue is already booked during the selected time. Please choose another time, date, or venue.";
	}
	if (error.code === "23514") {
		return "Some details are invalid. Check the times, attendee count, and email address.";
	}
	if (error.message?.toLowerCase().includes("venue is not active")) {
		return "That venue is no longer available. Please choose another one.";
	}
	return error.message ?? "Unable to submit the booking request.";
}

function BookPage() {
	const navigate = useNavigate();
	const { venue: venueParam } = Route.useSearch();
	const { user, profile } = useAuth();
	const [venues, setVenues] = useState<Venue[]>([]);
	const [openSeason, setOpenSeason] = useState<OpenSeason | null>(null);
	const [loadingVenues, setLoadingVenues] = useState(true);
	const [values, setValues] = useState<BookingFormValues>(() =>
		createEmptyForm(venueParam),
	);
	const [submitting, setSubmitting] = useState(false);
	const [availability, setAvailability] = useState<{
		venueId: string;
		date: string;
		entries: AvailabilityEntry[];
		loading: boolean;
	}>({ venueId: "", date: "", entries: [], loading: false });
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let active = true;

		async function load() {
			const now = new Date().toISOString();
			const [venuesResult, seasonResult] = await Promise.all([
				supabase.from("venues").select("*").eq("is_active", true).order("name"),
				supabase
					.from("open_seasons")
					.select("*")
					.eq("is_enabled", true)
					.lte("starts_at", now)
					.gt("ends_at", now)
					.maybeSingle(),
			]);

			if (!active) return;
			const nextVenues = (venuesResult.data as Venue[] | null) ?? [];
			setVenues(nextVenues);
			setOpenSeason((seasonResult.data as OpenSeason | null) ?? null);
			setValues((current) => {
				const requested = current.venueId || venueParam || "";
				if (nextVenues.some((venue) => venue.id === requested)) {
					return { ...current, venueId: requested };
				}
				if (nextVenues.length === 1) {
					return { ...current, venueId: nextVenues[0].id };
				}
				return { ...current, venueId: "" };
			});
			setLoadingVenues(false);
		}

		load();
		return () => {
			active = false;
		};
	}, [venueParam]);

	useEffect(() => {
		if (!venueParam) return;
		if (!venues.some((venue) => venue.id === venueParam)) return;
		setValues((current) =>
			current.venueId === venueParam
				? current
				: { ...current, venueId: venueParam },
		);
	}, [venueParam, venues]);

	useEffect(() => {
		if (!user) return;
		setValues((current) => ({
			...current,
			requesterName: current.requesterName || profile?.full_name || "",
			requesterEmail:
				current.requesterEmail || profile?.email || user.email || "",
			organizationName: current.organizationName || profile?.organization || "",
			requesterPhone: current.requesterPhone || profile?.phone || "",
		}));
	}, [user, profile]);

	const selectedVenue = useMemo(
		() => venues.find((venue) => venue.id === values.venueId) ?? null,
		[venues, values.venueId],
	);

	const handleDayAvailabilityChange = useCallback(
		(date: string, entries: AvailabilityEntry[], loading: boolean) => {
			setAvailability({ venueId: values.venueId, date, entries, loading });
		},
		[values.venueId],
	);

	const availabilityReady =
		Boolean(values.venueId && values.bookingDate) &&
		availability.venueId === values.venueId &&
		availability.date === values.bookingDate;
	const checkingAvailability =
		Boolean(values.venueId && values.bookingDate) &&
		(!availabilityReady || availability.loading);
	const selectedAvailability = availabilityReady
		? filterAvailabilityForVenue(availability.entries, values.venueId)
		: [];
	const schoolEvents = selectedAvailability.filter(
		(entry) => entry.kind === "school_event",
	);
	const activeBooking =
		selectedAvailability.find(
			(entry) =>
				entry.kind === "booking" &&
				availabilityConflicts(entry, values.startTime, values.endTime),
		) ?? null;
	const schoolEvent = schoolEvents[0] ?? null;
	const isUnavailable = Boolean(schoolEvent || activeBooking);
	const hasSelectedTime = Boolean(values.startTime && values.endTime);

	const update = <Key extends keyof BookingFormValues>(
		key: Key,
		value: BookingFormValues[Key],
	) => {
		setValues((current) => ({ ...current, [key]: value }));
	};

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		const validationError = validate(values);
		if (validationError) {
			setError(validationError);
			return;
		}
		if (checkingAvailability) {
			setError("Checking availability. Please try again in a moment.");
			return;
		}
		if (schoolEvents.length > 0) {
			setError(
				schoolEvents.length === 1
					? `This venue is reserved for the school event "${schoolEvents[0].label ?? "School event"}" on the selected date. Choose another venue or date.`
					: "This venue is reserved for school events on the selected date. Choose another venue or date.",
			);
			return;
		}
		if (activeBooking) {
			setError(
				hasSelectedTime
					? "This venue already has a confirmed booking during the selected time. Choose another time, venue, or date."
					: "This venue already has a confirmed booking on the selected date. Choose another venue or date.",
			);
			return;
		}

		setError(null);
		setSubmitting(true);

		const publicToken = crypto.randomUUID();
		const bookingId = crypto.randomUUID();
		const { error: insertError } = await supabase.from("bookings").insert({
			id: bookingId,
			public_token: publicToken,
			venue_id: values.venueId,
			booking_date: values.bookingDate,
			start_time: values.startTime || null,
			end_time: values.endTime || null,
			activity_name: values.activityName.trim(),
			activity_description: values.activityDescription.trim() || null,
			organization_name: values.organizationName.trim() || null,
			requester_name: values.requesterName.trim(),
			requester_email: values.requesterEmail.trim().toLowerCase(),
			requester_phone: values.requesterPhone.trim() || null,
			attendee_count: values.attendeeCount.trim()
				? Number(values.attendeeCount)
				: null,
		});

		if (insertError) {
			setError(mapInsertError(insertError));
			setSubmitting(false);
			return;
		}

		toast.success("Booking request submitted");

		try {
			const accountResult = await ensureBookingUser(bookingId, publicToken);
			const message = bookingUserMessage(accountResult);
			if (message?.type === "warning") toast.warning(message.message);
			else if (message) toast.success(message.message);
		} catch (accountError) {
			console.error("Unable to prepare booking account", accountError);
			toast.warning(
				"Booking submitted, but we could not prepare your account. Your booking link still works.",
			);
		}

		await navigate({
			to: "/bookings/$token",
			params: { token: publicToken },
			search: { created: true },
		});
	};

	return (
		<div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<Link
				to="/"
				className={cn(
					buttonVariants({ variant: "ghost", size: "sm" }),
					"-ml-2 mb-4 no-underline",
				)}
			>
				<ArrowLeft className="size-4" />
				Back to home
			</Link>

			<PageHeader
				eyebrow="New request"
				title="Request a venue"
				description="Tell us about your activity and when you need the space. Approved bookings and school events block requests; other pending requests do not. Bookings without times reserve the whole date."
			/>

			{openSeason ? (
				<div className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-300/60 bg-emerald-50 p-4 dark:border-emerald-400/20 dark:bg-emerald-400/10">
					<CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
					<div>
						<p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
							{openSeason.name} is active
						</p>
						<p className="text-sm text-emerald-900/80 dark:text-emerald-100/80">
							Requests submitted now are automatically approved when the venue
							and date are available.
						</p>
					</div>
				</div>
			) : null}

			<div className="mt-6 grid gap-6 lg:grid-cols-[1.45fr_0.55fr]">
				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
							Booking details
						</CardTitle>
						<CardDescription>
							Fields marked with an asterisk are required.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSubmit} className="space-y-6">
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2 sm:col-span-2">
									<Label htmlFor="venue" required>
										Venue
									</Label>
									<Select
										value={values.venueId}
										onValueChange={(value) => update("venueId", value)}
										disabled={loadingVenues || venues.length === 0}
									>
										<SelectTrigger
											id="venue"
											className="w-full"
											aria-required="true"
										>
											<SelectValue
												placeholder={
													loadingVenues
														? "Loading venues…"
														: venues.length === 0
															? "No venues available"
															: "Choose a venue"
												}
											/>
										</SelectTrigger>
										<SelectContent>
											{venues.map((venue) => (
												<SelectItem key={venue.id} value={venue.id}>
													{venue.name}
													{venue.capacity ? ` · ${venue.capacity} people` : ""}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label htmlFor="booking-date" required>
										Date
									</Label>
									<Input
										id="booking-date"
										type="date"
										min={todayIsoDate()}
										value={values.bookingDate}
										onChange={(event) =>
											update("bookingDate", event.target.value)
										}
										required
									/>
								</div>

								<div className="space-y-2">
									<div className="grid grid-cols-2 gap-3">
										<div className="space-y-2">
											<Label htmlFor="start-time">Start time</Label>
											<Input
												id="start-time"
												type="time"
												value={values.startTime}
												onChange={(event) =>
													update("startTime", event.target.value)
												}
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor="end-time">End time</Label>
											<Input
												id="end-time"
												type="time"
												value={values.endTime}
												onChange={(event) =>
													update("endTime", event.target.value)
												}
											/>
										</div>
									</div>
									<p className="text-xs text-muted-foreground">
										Optional. Leave both blank if the time is not decided yet.
									</p>
								</div>

								<div className="sm:col-span-2">
									<AvailabilityCalendar
										embedded
										venueId={values.venueId || null}
										venueName={selectedVenue?.name ?? null}
										selectedDate={values.bookingDate}
										selectedStartTime={values.startTime}
										selectedEndTime={values.endTime}
										onSelectDate={(date) => update("bookingDate", date)}
										onDayAvailabilityChange={handleDayAvailabilityChange}
									/>
								</div>

								{schoolEvent ? (
									<div className="flex items-start gap-3 rounded-xl border border-[#f0c75e]/60 bg-[#f0c75e]/15 px-4 py-3 sm:col-span-2">
										<School className="mt-0.5 size-4 shrink-0 text-[#a87a12] dark:text-[#f0c75e]" />
										<div>
											<p className="text-sm font-bold">
												Reserved for a school event
											</p>
											<p className="mt-0.5 text-sm text-muted-foreground">
												{schoolEvents.length === 1 ? (
													<>
														<span className="font-semibold text-foreground">
															{schoolEvent.label ?? "School event"}
														</span>{" "}
														takes priority on this date. This venue cannot be
														booked for {formatDate(values.bookingDate)}.
													</>
												) : (
													<>
														School events take priority on this date. This venue
														cannot be booked for{" "}
														{formatDate(values.bookingDate)}.
													</>
												)}
											</p>
										</div>
									</div>
								) : activeBooking ? (
									<div className="flex items-start gap-3 rounded-xl border border-rose-300/60 bg-rose-50 px-4 py-3 sm:col-span-2 dark:border-rose-400/25 dark:bg-rose-400/10">
										<TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-700 dark:text-rose-300" />
										<div>
											<p className="text-sm font-bold">
												{hasSelectedTime
													? "Already reserved for this time"
													: "Already reserved for this date"}
											</p>
											<p className="mt-0.5 text-sm text-muted-foreground">
												This venue has a{" "}
												{activeBooking.status === "approved"
													? "confirmed"
													: "pending"}{" "}
												booking{" "}
												{hasSelectedTime
													? "during the selected time"
													: `on ${formatDate(values.bookingDate)}`}
												. Choose another time, venue, or date.
											</p>
										</div>
									</div>
								) : null}

								<div className="space-y-2 sm:col-span-2">
									<Label htmlFor="activity-name" required>
										Activity name
									</Label>
									<Input
										id="activity-name"
										value={values.activityName}
										onChange={(event) =>
											update("activityName", event.target.value)
										}
										placeholder="e.g. Science fair rehearsal"
										required
									/>
								</div>

								<div className="space-y-2 sm:col-span-2">
									<Label htmlFor="activity-description">
										Activity description
									</Label>
									<Textarea
										id="activity-description"
										value={values.activityDescription}
										onChange={(event) =>
											update("activityDescription", event.target.value)
										}
										placeholder="Share what you need, equipment, or special arrangements."
										rows={3}
									/>
								</div>
							</div>

							<Separator />

							<div>
								<p className="mb-4 text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">
									Requester details
								</p>
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-2">
										<Label htmlFor="requester-name" required>
											Your name
										</Label>
										<Input
											id="requester-name"
											value={values.requesterName}
											onChange={(event) =>
												update("requesterName", event.target.value)
											}
											autoComplete="name"
											required
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="requester-email" required>
											Email
										</Label>
										<Input
											id="requester-email"
											type="email"
											value={values.requesterEmail}
											onChange={(event) =>
												update("requesterEmail", event.target.value)
											}
											autoComplete="email"
											required
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="organization">Organization</Label>
										<Input
											id="organization"
											value={values.organizationName}
											onChange={(event) =>
												update("organizationName", event.target.value)
											}
											placeholder="School, club, or department"
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="requester-phone">Phone</Label>
										<Input
											id="requester-phone"
											type="tel"
											value={values.requesterPhone}
											onChange={(event) =>
												update("requesterPhone", event.target.value)
											}
											autoComplete="tel"
										/>
									</div>
									<div className="space-y-2 sm:max-w-40">
										<Label htmlFor="attendees">Attendees</Label>
										<Input
											id="attendees"
											type="number"
											min={1}
											step={1}
											value={values.attendeeCount}
											onChange={(event) =>
												update("attendeeCount", event.target.value)
											}
											placeholder="e.g. 30"
										/>
									</div>
								</div>
							</div>

							{error ? (
								<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
									{error}
								</div>
							) : null}

							<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<p className="text-xs text-muted-foreground">
									Submitting does not guarantee approval. You will be notified
									by email.
								</p>
								<Button
									type="submit"
									disabled={
										submitting ||
										checkingAvailability ||
										isUnavailable ||
										venues.length === 0
									}
									className="sm:min-w-40"
								>
									<Send className="size-4" />
									{submitting ? "Submitting…" : "Submit request"}
								</Button>
							</div>
						</form>
					</CardContent>
				</Card>

				<div className="space-y-4">
					<Card className="border-border/70">
						<CardHeader>
							<CardTitle className="font-[Fraunces,Georgia,serif] text-lg">
								Request summary
							</CardTitle>
							<CardDescription>
								Double-check the details before sending.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3 text-sm">
							<div className="flex items-start gap-2">
								<Building2 className="mt-0.5 size-4 text-muted-foreground" />
								<div>
									<p className="font-semibold">
										{selectedVenue?.name ?? "No venue selected"}
									</p>
									{selectedVenue?.address ? (
										<p className="text-xs text-muted-foreground">
											{selectedVenue.address}
										</p>
									) : null}
								</div>
							</div>
							<div className="flex items-center gap-2">
								<CalendarDays className="size-4 text-muted-foreground" />
								<span>
									{values.bookingDate
										? formatDate(values.bookingDate)
										: "No date selected"}
								</span>
							</div>
							<div className="flex items-center gap-2">
								<Clock className="size-4 text-muted-foreground" />
								<span>{formatTimeRange(values.startTime, values.endTime)}</span>
							</div>
							{values.attendeeCount ? (
								<div className="flex items-center gap-2">
									<Users className="size-4 text-muted-foreground" />
									<span>{values.attendeeCount} attendees</span>
								</div>
							) : null}
							{selectedVenue?.capacity ? (
								<div className="flex items-center gap-2">
									<MapPin className="size-4 text-muted-foreground" />
									<span>Capacity: {selectedVenue.capacity}</span>
								</div>
							) : null}
							<Separator />
							<div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3">
								{checkingAvailability ? (
									<Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
								) : schoolEvent ? (
									<TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#a87a12] dark:text-[#f0c75e]" />
								) : activeBooking ? (
									<TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-300" />
								) : openSeason ? (
									<Sparkles className="mt-0.5 size-4 shrink-0 text-emerald-600" />
								) : (
									<Clock className="mt-0.5 size-4 shrink-0 text-amber-600" />
								)}
								<p className="text-xs leading-relaxed text-muted-foreground">
									{checkingAvailability
										? "Checking availability for the selected venue and date…"
										: schoolEvent
											? schoolEvents.length === 1
												? `Unavailable: this venue is reserved for the school event "${schoolEvent.label ?? "School event"}".`
												: `Unavailable: this venue is reserved for ${schoolEvents.length} school events on this date.`
											: activeBooking
												? `Unavailable: this venue already has a confirmed booking ${hasSelectedTime ? "during the selected time" : "on this date"}.`
												: openSeason
													? "Open season is active. This request will be approved automatically unless an approved booking or school event blocks it."
													: "An administrator will review this request. You will receive an email when the status changes."}
								</p>
							</div>
						</CardContent>
					</Card>

					{!user ? (
						<Card className="border-border/70">
							<CardContent className="pt-6 text-sm text-muted-foreground">
								<p>
									You can submit as a guest.{" "}
									<Link
										to="/signup"
										search={{ redirect: undefined }}
										className="font-semibold"
									>
										Create an account
									</Link>{" "}
									to keep all your requests in one dashboard.
								</p>
							</CardContent>
						</Card>
					) : null}
				</div>
			</div>
		</div>
	);
}
