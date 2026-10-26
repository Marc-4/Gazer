import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	Building2,
	CalendarDays,
	CheckCircle2,
	Clock,
	Copy,
	Mail,
	MapPin,
	Phone,
	SearchX,
	Users,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BookingStatusBadge } from "#/components/status-badge";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Button, buttonVariants } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Separator } from "#/components/ui/separator";
import { Skeleton } from "#/components/ui/skeleton";
import { parseBookingLookup } from "#/lib/booking-lookup";
import { formatDate, formatDateTime, formatTimeRange } from "#/lib/format";
import { supabase } from "#/lib/supabase";
import type { BookingStatus, PublicBooking } from "#/lib/types";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/bookings/$token")({
	validateSearch: (search: Record<string, unknown>) => ({
		created: search.created === true || search.created === "true",
	}),
	component: BookingStatusPage,
});

const statusIcon: Record<BookingStatus, typeof Clock> = {
	pending: Clock,
	approved: CheckCircle2,
	rejected: XCircle,
	cancelled: XCircle,
};

const statusTone: Record<BookingStatus, string> = {
	pending:
		"border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200",
	approved:
		"border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200",
	rejected:
		"border-rose-300/60 bg-rose-50 text-rose-900 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200",
	cancelled:
		"border-slate-300/60 bg-slate-50 text-slate-700 dark:border-slate-400/20 dark:bg-slate-400/10 dark:text-slate-200",
};

const statusCopy: Record<BookingStatus, { title: string; body: string }> = {
	pending: {
		title: "Waiting for review",
		body: "An administrator will review this request. We will email you when it is approved or rejected.",
	},
	approved: {
		title: "Your booking is approved",
		body: "The venue is reserved for your activity. Keep this page for your records.",
	},
	rejected: {
		title: "This request was rejected",
		body: "The requested venue and date could not be confirmed. Check the decision note below.",
	},
	cancelled: {
		title: "This booking was cancelled",
		body: "The date has been released. You can submit a new request whenever you are ready.",
	},
};

function DetailRow({
	icon: Icon,
	label,
	value,
}: {
	icon: typeof Building2;
	label: string;
	value: React.ReactNode;
}) {
	return (
		<div className="flex items-start gap-3">
			<Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			<div className="min-w-0">
				<p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
					{label}
				</p>
				<div className="mt-0.5 text-sm font-medium">{value}</div>
			</div>
		</div>
	);
}

function BookingStatusPage() {
	const { token } = Route.useParams();
	const { created } = Route.useSearch();
	const lookup = parseBookingLookup(token);
	const [booking, setBooking] = useState<PublicBooking | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [cancelling, setCancelling] = useState(false);

	const loadBooking = useCallback(async () => {
		if (!lookup) {
			setError("This booking link or reference is not valid.");
			setLoading(false);
			return;
		}

		const { data, error: rpcError } = await supabase.rpc(
			"get_booking_by_token",
			{ p_token: lookup },
		);

		if (rpcError) {
			setError(rpcError.message);
			setLoading(false);
			return;
		}

		const row = Array.isArray(data) ? data[0] : data;
		if (!row) {
			setError("We could not find a booking for this link.");
			setLoading(false);
			return;
		}

		setBooking(row as PublicBooking);
		setError(null);
		setLoading(false);
	}, [lookup]);

	useEffect(() => {
		loadBooking();
	}, [loadBooking]);

	const handleCancel = async () => {
		if (!lookup) return;

		setCancelling(true);
		const { error: cancelError } = await supabase.rpc(
			"cancel_booking_by_token",
			{ p_token: lookup, p_note: null },
		);
		setCancelling(false);

		if (cancelError) {
			toast.error(cancelError.message);
			return;
		}

		toast.success("Booking cancelled");
		await loadBooking();
	};

	const copyLink = async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			toast.success("Link copied");
		} catch {
			toast.error("Unable to copy the link");
		}
	};

	if (loading) {
		return (
			<div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="mt-6 h-48 w-full rounded-2xl" />
				<Skeleton className="mt-6 h-72 w-full rounded-2xl" />
			</div>
		);
	}

	if (error || !booking) {
		return (
			<div className="mx-auto w-full max-w-xl px-4 py-20 text-center sm:px-6">
				<div className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
					<SearchX className="size-6" />
				</div>
				<h1 className="mt-5 font-[Fraunces,Georgia,serif] text-3xl font-bold">
					Booking not found
				</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					{error ??
						"This link or reference may be invalid, or the booking no longer exists."}
				</p>
				<Link
					to="/bookings"
					className={cn(buttonVariants(), "mt-6 no-underline")}
				>
					Try another lookup
				</Link>
			</div>
		);
	}

	const Icon = statusIcon[booking.status];
	const copy = statusCopy[booking.status];
	const canCancel =
		booking.status === "pending" || booking.status === "approved";

	return (
		<div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
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

			{created ? (
				<div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-300/60 bg-emerald-50 p-4 dark:border-emerald-400/20 dark:bg-emerald-400/10">
					<CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
					<div>
						<p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
							Request submitted
						</p>
						<p className="text-sm text-emerald-900/80 dark:text-emerald-100/80">
							We emailed a confirmation to {booking.requester_email}. Save this
							private link to check status later.
						</p>
					</div>
				</div>
			) : null}

			<div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
				<div className="space-y-6">
					<Card className="overflow-hidden border-border/70">
						<div className={cn("border-b p-6", statusTone[booking.status])}>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div className="flex items-center gap-3">
									<span className="grid size-11 place-items-center rounded-xl bg-white/70 dark:bg-black/20">
										<Icon className="size-5" />
									</span>
									<div>
										<p className="text-xs font-bold uppercase tracking-[0.16em] opacity-70">
											{copy.title}
										</p>
										<p className="font-[Fraunces,Georgia,serif] text-2xl font-bold">
											{booking.reference}
										</p>
									</div>
								</div>
								<BookingStatusBadge status={booking.status} />
							</div>
							<p className="mt-4 max-w-2xl text-sm leading-relaxed opacity-90">
								{copy.body}
							</p>
						</div>

						<CardContent className="space-y-6 pt-6">
							<div>
								<h2 className="font-[Fraunces,Georgia,serif] text-xl font-bold">
									{booking.activity_name}
								</h2>
								{booking.activity_description ? (
									<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
										{booking.activity_description}
									</p>
								) : null}
							</div>

							<Separator />

							<div className="grid gap-5 sm:grid-cols-2">
								<DetailRow
									icon={Building2}
									label="Venue"
									value={
										<>
											{booking.venue_name}
											{booking.venue_address ? (
												<span className="mt-0.5 block text-xs font-normal text-muted-foreground">
													{booking.venue_address}
												</span>
											) : null}
										</>
									}
								/>
								<DetailRow
									icon={CalendarDays}
									label="Date"
									value={formatDate(booking.booking_date)}
								/>
								<DetailRow
									icon={Clock}
									label="Time"
									value={formatTimeRange(booking.start_time, booking.end_time)}
								/>
								<DetailRow
									icon={Users}
									label="Attendees"
									value={booking.attendee_count ?? "Not specified"}
								/>
								<DetailRow
									icon={Mail}
									label="Contact email"
									value={booking.requester_email}
								/>
								<DetailRow
									icon={Phone}
									label="Contact phone"
									value={booking.requester_phone || "Not provided"}
								/>
							</div>

							{booking.decision_note ? (
								<>
									<Separator />
									<div className="rounded-xl border border-border/70 bg-muted/50 p-4">
										<p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
											Decision note
										</p>
										<p className="mt-1 text-sm">{booking.decision_note}</p>
									</div>
								</>
							) : null}
						</CardContent>
					</Card>

					{canCancel ? (
						<Card className="border-border/70">
							<CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
								<div>
									<p className="text-sm font-semibold">Need to cancel?</p>
									<p className="text-xs text-muted-foreground">
										Cancelling releases the venue and date immediately.
									</p>
								</div>
								<AlertDialog>
									<AlertDialogTrigger asChild>
										<Button variant="destructive" disabled={cancelling}>
											{cancelling ? "Cancelling…" : "Cancel booking"}
										</Button>
									</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
											<AlertDialogDescription>
												This will release {booking.venue_name} on{" "}
												{formatDate(booking.booking_date)}. This action cannot
												be undone.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>Keep booking</AlertDialogCancel>
											<AlertDialogAction onClick={handleCancel}>
												Yes, cancel it
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							</CardContent>
						</Card>
					) : null}
				</div>

				<div className="space-y-4">
					<Card className="border-border/70">
						<CardHeader>
							<CardTitle className="text-base">Booking record</CardTitle>
							<CardDescription>
								Keep this private link to check the latest status.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3 text-sm">
							<div className="flex justify-between gap-3">
								<span className="text-muted-foreground">Reference</span>
								<span className="font-mono font-semibold">
									{booking.reference}
								</span>
							</div>
							<div className="flex justify-between gap-3">
								<span className="text-muted-foreground">Submitted</span>
								<span>{formatDateTime(booking.created_at)}</span>
							</div>
							<div className="flex justify-between gap-3">
								<span className="text-muted-foreground">Last update</span>
								<span>{formatDateTime(booking.updated_at)}</span>
							</div>
							{booking.organization_name ? (
								<div className="flex justify-between gap-3">
									<span className="text-muted-foreground">Organization</span>
									<span className="text-right">
										{booking.organization_name}
									</span>
								</div>
							) : null}
							<div className="flex justify-between gap-3">
								<span className="text-muted-foreground">Requested by</span>
								<span className="text-right">{booking.requester_name}</span>
							</div>
							<Button
								variant="outline"
								size="sm"
								className="mt-2 w-full"
								onClick={copyLink}
							>
								<Copy className="size-4" />
								Copy private link
							</Button>
						</CardContent>
					</Card>

					<Card className="border-border/70">
						<CardContent className="pt-6">
							<p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
								<MapPin className="mt-0.5 size-4 shrink-0" />A venue can host
								one approved booking per time slot. Pending requests may overlap
								until an administrator approves one, so submit a new request if
								you need a different time or date.
							</p>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
