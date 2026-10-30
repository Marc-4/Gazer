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
	type LucideIcon,
	MailWarning,
	School,
	Timer,
	Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	MiniBars,
	PeakHeatmap,
	SegmentedBar,
	Sparkline,
} from "#/components/dashboard-charts";
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
import { type AdminDashboard, fetchAdminDashboard } from "#/lib/dashboard";
import {
	formatDate,
	formatDateTime,
	formatDurationMinutes,
	formatPercent,
	formatTimeRange,
	toLocalDate,
} from "#/lib/format";
import {
	useBookingsRealtime,
	useNotificationOutboxRealtime,
} from "#/lib/use-realtime";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/admin/")({
	component: AdminOverview,
});

function StatCard({
	label,
	value,
	detail,
	icon: Icon,
	tone,
}: {
	label: string;
	value: number;
	detail?: string;
	icon: LucideIcon;
	tone: string;
}) {
	return (
		<Card className="border-border/70">
			<CardContent className="flex items-center justify-between pt-6">
				<div>
					<p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
						{label}
					</p>
					<p className="mt-1 font-[Fraunces,Georgia,serif] text-3xl font-bold">
						{value}
					</p>
					{detail ? (
						<p className="mt-1 text-xs text-muted-foreground">{detail}</p>
					) : null}
				</div>
				<span
					className={cn("grid size-10 place-items-center rounded-xl", tone)}
				>
					<Icon className="size-5" />
				</span>
			</CardContent>
		</Card>
	);
}

function AdminOverview() {
	const [data, setData] = useState<AdminDashboard | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			const next = await fetchAdminDashboard();
			setData(next);
			setError(null);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Unable to load dashboard data.",
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	useBookingsRealtime(load);
	useNotificationOutboxRealtime(load);

	if (loading) {
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

	if (!data) {
		return (
			<div>
				<PageHeader
					eyebrow="Admin overview"
					title="Operations at a glance"
					description="Review incoming requests, manage availability, and keep bookers informed."
				/>
				<Card className="mt-6 border-border/70">
					<CardContent className="py-10 text-center">
						<p className="font-semibold">Couldn’t load the dashboard</p>
						<p className="mt-1 text-sm text-muted-foreground">
							{error ?? "Try refreshing the page."}
						</p>
						<button
							type="button"
							onClick={load}
							className={cn(
								buttonVariants({ variant: "outline", size: "sm" }),
								"mt-4",
							)}
						>
							Retry
						</button>
					</CardContent>
				</Card>
			</div>
		);
	}

	const { summary, pending_aging, decision_turnaround, outcome_mix } = data;
	const { notification_health, cancellation_drivers } = data;

	const trendTotal = data.demand_trend.reduce(
		(acc, point) => acc + point.count,
		0,
	);
	const last7 = data.demand_trend
		.slice(-7)
		.reduce((acc, point) => acc + point.count, 0);
	const prior7 = data.demand_trend
		.slice(-14, -7)
		.reduce((acc, point) => acc + point.count, 0);
	const demandDelta =
		prior7 === 0 ? null : Math.round(((last7 - prior7) / prior7) * 100);
	const scheduleTotal = data.schedule_density.reduce(
		(acc, point) => acc + point.count,
		0,
	);
	const busiest = [...data.peak_times].sort((a, b) => b.count - a.count)[0];
	const idleVenues = data.venue_utilization.filter(
		(venue) => venue.is_active && venue.upcoming_approved === 0,
	).length;
	const venues = data.venue_utilization.slice(0, 6);
	const schoolEventShare =
		cancellation_drivers.total === 0
			? null
			: cancellation_drivers.school_event / cancellation_drivers.total;
	const lostShare =
		outcome_mix.total === 0
			? null
			: (outcome_mix.rejected + outcome_mix.cancelled) / outcome_mix.total;

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
				<StatCard
					label="Pending requests"
					value={summary.pending}
					detail={`${pending_aging.over_three_days} older than 3 days`}
					icon={Clock}
					tone="bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
				/>
				<StatCard
					label="Upcoming approved"
					value={summary.approved_upcoming}
					detail="Scheduled from today"
					icon={CheckCircle2}
					tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
				/>
				<StatCard
					label="Active venues"
					value={summary.active_venues}
					detail={`${idleVenues} with nothing upcoming`}
					icon={Building2}
					tone="bg-[#2451d8]/10 text-[#1c3fae] dark:bg-[#f0c75e]/10 dark:text-[#f0c75e]"
				/>
				<StatCard
					label="Failed emails"
					value={summary.failed_notifications}
					detail={`${notification_health.pending_backlog} queued`}
					icon={MailWarning}
					tone="bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300"
				/>
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
				<Card className="border-border/70">
					<CardHeader className="flex-row items-start justify-between gap-3">
						<div>
							<CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
								Demand trend
							</CardTitle>
							<CardDescription>
								Requests created in the last 30 days.
							</CardDescription>
						</div>
						<div className="text-right">
							<p className="font-[Fraunces,Georgia,serif] text-2xl font-bold">
								{trendTotal}
							</p>
							<p className="text-xs text-muted-foreground">
								{demandDelta === null
									? "New requests"
									: `${demandDelta >= 0 ? "+" : ""}${demandDelta}% vs. prior week`}
							</p>
						</div>
					</CardHeader>
					<CardContent>
						<Sparkline
							data={data.demand_trend}
							className="text-[#2451d8] dark:text-[#f0c75e]"
						/>
						<div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
							<span>{formatDate(data.demand_trend[0]?.date)}</span>
							<span>
								{last7} this week · {prior7} prior week
							</span>
							<span>Today</span>
						</div>
					</CardContent>
				</Card>

				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 font-[Fraunces,Georgia,serif] text-xl">
							<Clock className="size-4 text-amber-600" />
							Pending aging
						</CardTitle>
						<CardDescription>
							How long requests have waited for a decision.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex items-end justify-between">
							<p className="font-[Fraunces,Georgia,serif] text-3xl font-bold">
								{pending_aging.total}
							</p>
							<p className="text-xs text-muted-foreground">
								{pending_aging.over_three_days > 0
									? `${pending_aging.over_three_days} need attention`
									: "Nothing stale"}
							</p>
						</div>
						<SegmentedBar
							className="mt-3"
							segments={[
								{
									label: "Under 24 hours",
									value: pending_aging.under_24h,
									className: "bg-emerald-500",
								},
								{
									label: "1–3 days",
									value: pending_aging.one_to_three_days,
									className: "bg-amber-400",
								},
								{
									label: "Over 3 days",
									value: pending_aging.over_three_days,
									className: "bg-rose-500",
								},
							]}
						/>
						<div className="mt-3 grid grid-cols-3 gap-2 text-xs">
							<div>
								<p className="font-semibold">{pending_aging.under_24h}</p>
								<p className="text-muted-foreground">Under 24h</p>
							</div>
							<div>
								<p className="font-semibold">
									{pending_aging.one_to_three_days}
								</p>
								<p className="text-muted-foreground">1–3 days</p>
							</div>
							<div>
								<p className="font-semibold text-rose-600 dark:text-rose-400">
									{pending_aging.over_three_days}
								</p>
								<p className="text-muted-foreground">Over 3 days</p>
							</div>
						</div>
						{pending_aging.oldest.length > 0 ? (
							<div className="mt-4 border-t border-border/70 pt-3">
								<p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
									Oldest requests
								</p>
								<div className="mt-2 divide-y divide-border/70">
									{pending_aging.oldest.slice(0, 3).map((booking) => (
										<Link
											key={booking.id}
											to="/admin/bookings"
											search={{ review: booking.id }}
											className="flex items-center justify-between gap-3 py-2 text-sm no-underline first:pt-0 last:pb-0"
										>
											<div className="min-w-0">
												<p className="truncate font-medium">
													{booking.activity_name}
												</p>
												<p className="truncate text-xs text-muted-foreground">
													{booking.reference} ·{" "}
													{booking.venue_name ?? "Unknown venue"}
												</p>
											</div>
											<span className="shrink-0 text-xs font-semibold text-rose-600 dark:text-rose-400">
												{formatDurationMinutes(booking.waited_hours * 60)}
											</span>
										</Link>
									))}
								</div>
							</div>
						) : null}
					</CardContent>
				</Card>
			</div>

			<div className="mt-6 grid gap-6 lg:grid-cols-3">
				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 font-[Fraunces,Georgia,serif] text-xl">
							<Timer className="size-4 text-[#2451d8] dark:text-[#f0c75e]" />
							Decision turnaround
						</CardTitle>
						<CardDescription>
							Time from request to decision, all decided requests.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{[
							{
								label: "All time",
								stats: decision_turnaround.all_time,
							},
							{
								label: "Last 30 days",
								stats: decision_turnaround.last_30_days,
							},
						].map(({ label, stats }) => (
							<div key={label}>
								<div className="flex items-center justify-between">
									<p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
										{label}
									</p>
									<p className="text-xs text-muted-foreground">
										{stats.count} decision{stats.count === 1 ? "" : "s"}
									</p>
								</div>
								<div className="mt-1 flex items-baseline gap-3">
									<p className="font-[Fraunces,Georgia,serif] text-2xl font-bold">
										{formatDurationMinutes(stats.avg_minutes)}
									</p>
									<p className="text-xs text-muted-foreground">
										avg · {formatDurationMinutes(stats.median_minutes)} median
									</p>
								</div>
							</div>
						))}
						<p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
							Median is less affected by a handful of very old requests.
						</p>
					</CardContent>
				</Card>

				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
							Outcome mix
						</CardTitle>
						<CardDescription>
							Where all {outcome_mix.total} requests ended up.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<SegmentedBar
							total={outcome_mix.total}
							segments={[
								{
									label: "Approved",
									value: outcome_mix.approved,
									className: "bg-emerald-500",
								},
								{
									label: "Pending",
									value: outcome_mix.pending,
									className: "bg-amber-400",
								},
								{
									label: "Rejected",
									value: outcome_mix.rejected,
									className: "bg-rose-500",
								},
								{
									label: "Cancelled",
									value: outcome_mix.cancelled,
									className: "bg-zinc-400 dark:bg-zinc-600",
								},
							]}
						/>
						<div className="mt-4 grid grid-cols-2 gap-3 text-sm">
							{[
								{
									label: "Approved",
									value: outcome_mix.approved,
									dot: "bg-emerald-500",
								},
								{
									label: "Pending",
									value: outcome_mix.pending,
									dot: "bg-amber-400",
								},
								{
									label: "Rejected",
									value: outcome_mix.rejected,
									dot: "bg-rose-500",
								},
								{
									label: "Cancelled",
									value: outcome_mix.cancelled,
									dot: "bg-zinc-400 dark:bg-zinc-600",
								},
							].map((item) => (
								<div key={item.label} className="flex items-center gap-2">
									<span className={cn("size-2 rounded-full", item.dot)} />
									<span className="text-muted-foreground">{item.label}</span>
									<span className="ml-auto font-semibold">{item.value}</span>
								</div>
							))}
						</div>
						<div className="mt-4 space-y-1 border-t border-border/70 pt-3 text-xs">
							<p className="flex justify-between">
								<span className="text-muted-foreground">Approval rate</span>
								<span className="font-semibold">
									{formatPercent(outcome_mix.approval_rate)}
								</span>
							</p>
							<p className="flex justify-between">
								<span className="text-muted-foreground">Auto-approved</span>
								<span className="font-semibold">
									{outcome_mix.auto_approved} ·{" "}
									{formatPercent(outcome_mix.auto_approved_share)}
								</span>
							</p>
							<p className="flex justify-between">
								<span className="text-muted-foreground">Not approved</span>
								<span className="font-semibold">
									{outcome_mix.rejected + outcome_mix.cancelled} ·{" "}
									{formatPercent(lostShare)}
								</span>
							</p>
						</div>
					</CardContent>
				</Card>

				<Card className="border-border/70">
					<CardHeader className="flex-row items-start justify-between gap-3">
						<div>
							<CardTitle className="flex items-center gap-2 font-[Fraunces,Georgia,serif] text-xl">
								<MailWarning className="size-4 text-rose-500" />
								Notification health
							</CardTitle>
							<CardDescription>
								Outbox backlog, delivery lag, and retries.
							</CardDescription>
						</div>
						<Link
							to="/admin/notifications"
							className={cn(
								buttonVariants({ variant: "ghost", size: "sm" }),
								"shrink-0 no-underline",
							)}
						>
							Outbox
							<ArrowRight className="size-3.5" />
						</Link>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-2 gap-3">
							{[
								{
									label: "Queued",
									value: notification_health.pending_backlog,
									tone: "text-amber-600 dark:text-amber-400",
								},
								{
									label: "Failed",
									value: notification_health.failed,
									tone: "text-rose-600 dark:text-rose-400",
								},
								{
									label: "Retried",
									value: notification_health.retries,
									tone: "text-[#2451d8] dark:text-[#f0c75e]",
								},
								{
									label: "Sent · 24h",
									value: notification_health.sent_last_24h,
									tone: "text-emerald-600 dark:text-emerald-400",
								},
							].map((item) => (
								<div
									key={item.label}
									className="rounded-lg border border-border/70 px-3 py-2"
								>
									<p className="text-xs text-muted-foreground">{item.label}</p>
									<p className={cn("text-xl font-bold", item.tone)}>
										{item.value}
									</p>
								</div>
							))}
						</div>
						<div className="mt-4 space-y-1 text-xs">
							<p className="flex justify-between">
								<span className="text-muted-foreground">Avg delivery lag</span>
								<span className="font-semibold">
									{formatDurationMinutes(notification_health.avg_lag_minutes)}
								</span>
							</p>
							<p className="flex justify-between">
								<span className="text-muted-foreground">
									Worst delivery lag
								</span>
								<span className="font-semibold">
									{formatDurationMinutes(notification_health.max_lag_minutes)}
								</span>
							</p>
							<p className="flex justify-between">
								<span className="text-muted-foreground">Oldest queued</span>
								<span className="font-semibold">
									{formatDurationMinutes(
										notification_health.oldest_pending_minutes,
									)}
								</span>
							</p>
							<p className="flex justify-between">
								<span className="text-muted-foreground">Total attempts</span>
								<span className="font-semibold">
									{notification_health.total_attempts}
								</span>
							</p>
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 font-[Fraunces,Georgia,serif] text-xl">
							<Building2 className="size-4 text-[#2451d8] dark:text-[#f0c75e]" />
							Venue utilization
						</CardTitle>
						<CardDescription>
							Upcoming approved bookings and estimated attendance vs. capacity.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{venues.length === 0 ? (
							<p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
								No venues yet.
							</p>
						) : (
							<div className="space-y-4">
								{venues.map((venue) => {
									const fill = venue.avg_fill_rate;
									return (
										<div key={venue.venue_id}>
											<div className="flex items-center justify-between gap-3 text-sm">
												<div className="flex min-w-0 items-center gap-2">
													<p className="truncate font-medium">
														{venue.venue_name}
													</p>
													{!venue.is_active ? (
														<span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
															Inactive
														</span>
													) : null}
												</div>
												<p className="shrink-0 text-xs text-muted-foreground">
													cap {venue.capacity ?? "—"}
												</p>
											</div>
											<div className="mt-1.5 flex items-center gap-2">
												<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
													<div
														className="h-full rounded-full bg-[#2451d8] dark:bg-[#f0c75e]"
														style={{
															width: `${Math.min(100, Math.round((fill ?? 0) * 100))}%`,
														}}
													/>
												</div>
												<span className="w-10 text-right text-xs font-semibold">
													{formatPercent(fill)}
												</span>
											</div>
											<p className="mt-1 text-xs text-muted-foreground">
												{venue.upcoming_approved} approved ·{" "}
												{venue.upcoming_pending} pending ·{" "}
												{venue.upcoming_attendees} attendees
											</p>
										</div>
									);
								})}
							</div>
						)}
					</CardContent>
				</Card>

				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
							Peak times
						</CardTitle>
						<CardDescription>
							{data.peak_times.length > 0
								? `Busiest: ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][busiest.dow]} at ${busiest.hour}:00 (${busiest.count})`
								: "Requests created in the last 90 days with a start time."}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<PeakHeatmap cells={data.peak_times} />
					</CardContent>
				</Card>
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-2">
				<Card className="border-border/70">
					<CardHeader className="flex-row items-start justify-between gap-3">
						<div>
							<CardTitle className="flex items-center gap-2 font-[Fraunces,Georgia,serif] text-xl">
								<CalendarDays className="size-4 text-[#2451d8] dark:text-[#f0c75e]" />
								Schedule density
							</CardTitle>
							<CardDescription>
								Pending and approved bookings over the next 14 days.
							</CardDescription>
						</div>
						<Link
							to="/admin/calendar"
							className={cn(
								buttonVariants({ variant: "ghost", size: "sm" }),
								"shrink-0 no-underline",
							)}
						>
							Calendar
							<ArrowRight className="size-3.5" />
						</Link>
					</CardHeader>
					<CardContent>
						<div className="mb-2 flex items-baseline gap-2">
							<p className="font-[Fraunces,Georgia,serif] text-2xl font-bold">
								{scheduleTotal}
							</p>
							<p className="text-xs text-muted-foreground">
								bookings scheduled
							</p>
						</div>
						<MiniBars
							data={data.schedule_density}
							labelFormat={(date) => String(toLocalDate(date).getDate())}
						/>
						<div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
							<span>{formatDate(data.schedule_density[0]?.date)}</span>
							<span>
								{formatDate(
									data.schedule_density[data.schedule_density.length - 1]?.date,
								)}
							</span>
						</div>
					</CardContent>
				</Card>

				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
							Cancellation drivers
						</CardTitle>
						<CardDescription>
							School-event cancellations vs. manual cancellations.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{cancellation_drivers.total === 0 ? (
							<p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
								No cancellations yet.
							</p>
						) : (
							<>
								<SegmentedBar
									segments={[
										{
											label: "School event",
											value: cancellation_drivers.school_event,
											className: "bg-[#2451d8] dark:bg-[#f0c75e]",
										},
										{
											label: "Manual",
											value: cancellation_drivers.manual,
											className: "bg-zinc-400 dark:bg-zinc-600",
										},
									]}
								/>
								<div className="mt-4 grid grid-cols-2 gap-4">
									<div>
										<p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
											School event
										</p>
										<p className="mt-1 font-[Fraunces,Georgia,serif] text-2xl font-bold">
											{cancellation_drivers.school_event}
										</p>
										<p className="text-xs text-muted-foreground">
											{formatPercent(schoolEventShare)} of cancellations
										</p>
									</div>
									<div>
										<p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
											Manual
										</p>
										<p className="mt-1 font-[Fraunces,Georgia,serif] text-2xl font-bold">
											{cancellation_drivers.manual}
										</p>
										<p className="text-xs text-muted-foreground">
											by bookers or admins
										</p>
									</div>
								</div>
								<p className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
									Last 30 days: {cancellation_drivers.last_30d_total} total ·{" "}
									{cancellation_drivers.last_30d_school_event} school event ·{" "}
									{cancellation_drivers.last_30d_manual} manual
								</p>
							</>
						)}
					</CardContent>
				</Card>
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_0.5fr]">
				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
							Recent requests
						</CardTitle>
					</CardHeader>
					<CardContent>
						{data.recent_bookings.length === 0 ? (
							<p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
								No booking requests yet.
							</p>
						) : (
							<div className="divide-y divide-border/70">
								{data.recent_bookings.map((booking) => (
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
												<span>·</span>
												<span>{formatDateTime(booking.created_at)}</span>
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
	);
}
