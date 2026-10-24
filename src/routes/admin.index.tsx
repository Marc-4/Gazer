import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Building2,
	CalendarClock,
	CalendarDays,
	CheckCircle2,
	Clock,
	History,
	LockOpen,
	MailWarning,
	School,
	Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "#/components/page-header";
import { BookingStatusBadge } from "#/components/status-badge";
import { buttonVariants } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { formatDate, formatTimeRange, todayIsoDate } from "#/lib/format";
import { supabase } from "#/lib/supabase";
import type { BookingWithVenue } from "#/lib/types";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/admin/")({
	component: AdminOverview,
});

interface Stats {
	pending: number;
	approvedUpcoming: number;
	activeVenues: number;
	failedNotifications: number;
}

function AdminOverview() {
	const [stats, setStats] = useState<Stats | null>(null);
	const [recent, setRecent] = useState<BookingWithVenue[]>([]);
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		const today = todayIsoDate();
		const [
			pending,
			approvedUpcoming,
			activeVenues,
			failedNotifications,
			recentResult,
		] = await Promise.all([
			supabase
				.from("bookings")
				.select("*", { count: "exact", head: true })
				.eq("status", "pending"),
			supabase
				.from("bookings")
				.select("*", { count: "exact", head: true })
				.eq("status", "approved")
				.gte("booking_date", today),
			supabase
				.from("venues")
				.select("*", { count: "exact", head: true })
				.eq("is_active", true),
			supabase
				.from("notification_outbox")
				.select("*", { count: "exact", head: true })
				.eq("status", "failed"),
			supabase
				.from("bookings")
				.select("*, venue:venues(id, name, address, capacity)")
				.order("created_at", { ascending: false })
				.limit(5),
		]);

		setStats({
			pending: pending.count ?? 0,
			approvedUpcoming: approvedUpcoming.count ?? 0,
			activeVenues: activeVenues.count ?? 0,
			failedNotifications: failedNotifications.count ?? 0,
		});
		setRecent((recentResult.data as BookingWithVenue[] | null) ?? []);
		setLoading(false);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	if (loading || !stats) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-9 w-56" />
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					{["s1", "s2", "s3", "s4"].map((key) => (
						<Skeleton key={key} className="h-28 rounded-xl" />
					))}
				</div>
				<Skeleton className="h-80 rounded-xl" />
			</div>
		);
	}

	const cards = [
		{
			label: "Pending requests",
			value: stats.pending,
			icon: Clock,
			tone: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
		},
		{
			label: "Upcoming approved",
			value: stats.approvedUpcoming,
			icon: CheckCircle2,
			tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
		},
		{
			label: "Active venues",
			value: stats.activeVenues,
			icon: Building2,
			tone: "bg-[#2451d8]/10 text-[#1c3fae] dark:bg-[#f0c75e]/10 dark:text-[#f0c75e]",
		},
		{
			label: "Failed emails",
			value: stats.failedNotifications,
			icon: MailWarning,
			tone: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
		},
	];

	return (
		<div>
			<PageHeader
				eyebrow="Admin overview"
				title="Operations at a glance"
				description="Review incoming requests, manage availability, and keep bookers informed."
				action={
					<Link
						to="/admin/bookings"
						className={cn(buttonVariants(), "no-underline")}
					>
						Review bookings
						<ArrowRight className="size-4" />
					</Link>
				}
			/>

			<div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{cards.map((card) => (
					<Card key={card.label} className="border-border/70">
						<CardContent className="flex items-center justify-between pt-6">
							<div>
								<p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
									{card.label}
								</p>
								<p className="mt-1 font-[Fraunces,Georgia,serif] text-3xl font-bold">
									{card.value}
								</p>
							</div>
							<span
								className={cn(
									"grid size-10 place-items-center rounded-xl",
									card.tone,
								)}
							>
								<card.icon className="size-5" />
							</span>
						</CardContent>
					</Card>
				))}
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_0.5fr]">
				<Card className="border-border/70">
					<CardHeader className="flex-row items-start justify-between gap-3">
						<div>
							<CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
								Recent requests
							</CardTitle>
							<CardDescription>
								The five most recently submitted bookings.
							</CardDescription>
						</div>
						<Link
							to="/admin/bookings"
							className={cn(
								buttonVariants({ variant: "ghost", size: "sm" }),
								"no-underline",
							)}
						>
							View all
						</Link>
					</CardHeader>
					<CardContent>
						{recent.length === 0 ? (
							<p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
								No booking requests yet.
							</p>
						) : (
							<div className="divide-y divide-border/70">
								{recent.map((booking) => (
									<div
										key={booking.id}
										className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
									>
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<p className="truncate text-sm font-semibold">
													{booking.activity_name}
												</p>
												<BookingStatusBadge status={booking.status} />
											</div>
											<p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
												<Link
													to="/admin/bookings"
													search={{ review: booking.id }}
													className="font-mono font-semibold underline-offset-4 hover:underline"
												>
													{booking.reference}
												</Link>
												<span>·</span>
												{booking.venue ? (
													<Link
														to="/admin/venues"
														search={{ venue: booking.venue.id }}
														className="underline-offset-4 hover:underline"
													>
														{booking.venue.name}
													</Link>
												) : (
													<span>Unknown venue</span>
												)}
												<span>·</span>
												<span>{booking.requester_name}</span>
											</p>
										</div>
										<Link
											to="/admin/calendar"
											search={{ date: booking.booking_date }}
											className="text-right text-xs text-muted-foreground underline-offset-4 hover:underline"
										>
											<p>{formatDate(booking.booking_date)}</p>
											<p>
												{formatTimeRange(booking.start_time, booking.end_time)}
											</p>
										</Link>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				<div className="space-y-4">
					<Card className="border-border/70">
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<CalendarClock className="size-4 text-[#2451d8]" />
								Quick actions
							</CardTitle>
						</CardHeader>
						<CardContent className="grid gap-2">
							<Link
								to="/admin/calendar"
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
									"w-full justify-start no-underline",
								)}
							>
								<CalendarDays className="size-4" />
								Calendar
							</Link>
							<Link
								to="/admin/events"
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
									"w-full justify-start no-underline",
								)}
							>
								<School className="size-4" />
								School events
							</Link>
							<Link
								to="/admin/venues"
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
									"w-full justify-start no-underline",
								)}
							>
								<Building2 className="size-4" />
								Manage venues
							</Link>
							<Link
								to="/admin/open-seasons"
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
									"w-full justify-start no-underline",
								)}
							>
								<LockOpen className="size-4" />
								Open seasons
							</Link>
							<Link
								to="/admin/users"
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
									"w-full justify-start no-underline",
								)}
							>
								<Users className="size-4" />
								Manage users
							</Link>
							<Link
								to="/admin/audit"
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
									"w-full justify-start no-underline",
								)}
							>
								<History className="size-4" />
								Audit log
							</Link>
							<Link
								to="/admin/notifications"
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
									"w-full justify-start no-underline",
								)}
							>
								<MailWarning className="size-4" />
								Email outbox
							</Link>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
