import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	CalendarDays,
	CalendarPlus,
	Loader2,
	Search,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "#/components/empty-state";
import { PageHeader } from "#/components/page-header";
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
import { Input } from "#/components/ui/input";
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
import { useAuth } from "#/lib/auth";
import {
	formatDate,
	formatDateTime,
	formatTimeRange,
	todayIsoDate,
} from "#/lib/format";
import { supabase } from "#/lib/supabase";
import type { BookingStatus, BookingWithVenue } from "#/lib/types";
import { useBookingsRealtime } from "#/lib/use-realtime";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/dashboard/bookings")({
	component: BookerBookings,
});

type Filter = "all" | "upcoming" | BookingStatus;

const filters: Array<{ value: Filter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "upcoming", label: "Upcoming" },
	{ value: "pending", label: "Pending" },
	{ value: "approved", label: "Approved" },
	{ value: "rejected", label: "Rejected" },
	{ value: "cancelled", label: "Cancelled" },
];

function BookerBookings() {
	const { user, loading: authLoading } = useAuth();
	const [bookings, setBookings] = useState<BookingWithVenue[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState<Filter>("all");
	const [query, setQuery] = useState("");
	const [cancellingId, setCancellingId] = useState<string | null>(null);

	const loadBookings = useCallback(async () => {
		if (!user) return;
		const { data, error } = await supabase
			.from("bookings")
			.select("*, venue:venues(id, name, address, capacity)")
			.eq("user_id", user.id)
			.order("booking_date", { ascending: false });

		if (error) {
			toast.error(error.message);
			setLoading(false);
			return;
		}

		setBookings((data as BookingWithVenue[] | null) ?? []);
		setLoading(false);
	}, [user]);

	useEffect(() => {
		if (user) loadBookings();
	}, [user, loadBookings]);

	useBookingsRealtime(loadBookings, Boolean(user));

	const today = todayIsoDate();

	const filtered = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		return bookings.filter((booking) => {
			const matchesFilter =
				filter === "all"
					? true
					: filter === "upcoming"
						? booking.booking_date >= today &&
							(booking.status === "pending" || booking.status === "approved")
						: booking.status === filter;
			if (!matchesFilter) return false;
			if (!normalized) return true;
			return [
				booking.reference,
				booking.activity_name,
				booking.venue?.name,
				booking.requester_name,
			]
				.filter(Boolean)
				.some((value) => value?.toLowerCase().includes(normalized));
		});
	}, [bookings, filter, query, today]);

	const handleCancel = async (bookingId: string) => {
		setCancellingId(bookingId);
		const { error } = await supabase.rpc("cancel_my_booking", {
			p_booking_id: bookingId,
			p_note: null,
		});
		setCancellingId(null);

		if (error) {
			toast.error(error.message);
			return;
		}

		toast.success("Booking cancelled");
		await loadBookings();
	};

	if (authLoading || (user && loading)) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-9 w-56" />
				<Skeleton className="h-96 rounded-xl" />
			</div>
		);
	}

	if (!user) return null;

	return (
		<div>
			<PageHeader
				eyebrow="My requests"
				title="Bookings"
				description="Review every request you have submitted, open its private status page, or cancel an active booking."
				action={
					<Link to="/book" className={cn(buttonVariants(), "no-underline")}>
						<CalendarPlus className="size-4" />
						New request
					</Link>
				}
			/>

			<Card className="mt-6 border-border/70">
				<CardHeader className="gap-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
								My bookings
							</CardTitle>
							<CardDescription>
								{filtered.length} of {bookings.length} requests
							</CardDescription>
						</div>
						<div className="relative w-full sm:w-72">
							<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search reference, activity, venue…"
								className="pl-9"
							/>
						</div>
					</div>
					<Tabs
						value={filter}
						onValueChange={(value) => setFilter(value as Filter)}
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
					{filtered.length === 0 ? (
						<EmptyState
							icon={CalendarDays}
							title={
								bookings.length === 0
									? "No bookings yet"
									: "No bookings match this view"
							}
							description={
								bookings.length === 0
									? "Submit your first venue request and it will appear here."
									: "Try a different status filter or search term."
							}
							action={
								bookings.length === 0 ? (
									<Link
										to="/book"
										className={cn(buttonVariants(), "no-underline")}
									>
										Request a venue
									</Link>
								) : null
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
									{filtered.map((booking) => (
										<TableRow key={booking.id}>
											<TableCell>
												<p className="font-mono text-xs font-semibold">
													{booking.reference}
												</p>
												<p className="mt-0.5 text-[11px] text-muted-foreground">
													{formatDateTime(booking.created_at)}
												</p>
											</TableCell>
											<TableCell className="max-w-56">
												<p className="truncate font-medium">
													{booking.activity_name}
												</p>
												<p className="truncate text-xs text-muted-foreground">
													{booking.organization_name || "Personal request"}
												</p>
											</TableCell>
											<TableCell className="max-w-40">
												<p className="truncate text-sm">
													{booking.venue?.name ?? "Unknown"}
												</p>
											</TableCell>
											<TableCell>
												<p className="text-sm">
													{formatDate(booking.booking_date)}
												</p>
												<p className="text-xs text-muted-foreground">
													{formatTimeRange(
														booking.start_time,
														booking.end_time,
													)}
												</p>
											</TableCell>
											<TableCell>
												<BookingStatusBadge status={booking.status} />
											</TableCell>
											<TableCell>
												<div className="flex items-center justify-end gap-1">
													<Link
														to="/bookings/$token"
														params={{ token: booking.public_token }}
														search={{ created: false }}
														className={cn(
															buttonVariants({
																variant: "ghost",
																size: "sm",
															}),
															"no-underline",
														)}
													>
														View
														<ArrowRight className="size-3.5" />
													</Link>
													{booking.status === "pending" ||
													booking.status === "approved" ? (
														<AlertDialog>
															<AlertDialogTrigger asChild>
																<Button
																	variant="ghost"
																	size="sm"
																	className="text-destructive hover:bg-destructive/10 hover:text-destructive"
																	disabled={cancellingId === booking.id}
																>
																	{cancellingId === booking.id ? (
																		<Loader2 className="size-3.5 animate-spin" />
																	) : (
																		<XCircle className="size-3.5" />
																	)}
																	Cancel
																</Button>
															</AlertDialogTrigger>
															<AlertDialogContent>
																<AlertDialogHeader>
																	<AlertDialogTitle>
																		Cancel this booking?
																	</AlertDialogTitle>
																	<AlertDialogDescription>
																		This releases {booking.venue?.name} on{" "}
																		{formatDate(booking.booking_date)}. This
																		cannot be undone.
																	</AlertDialogDescription>
																</AlertDialogHeader>
																<AlertDialogFooter>
																	<AlertDialogCancel>
																		Keep booking
																	</AlertDialogCancel>
																	<AlertDialogAction
																		onClick={() => handleCancel(booking.id)}
																	>
																		Yes, cancel it
																	</AlertDialogAction>
																</AlertDialogFooter>
															</AlertDialogContent>
														</AlertDialog>
													) : null}
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
