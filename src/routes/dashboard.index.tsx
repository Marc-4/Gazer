import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Building2,
	CalendarPlus,
	Clock,
	type LucideIcon,
	MapPin,
	Pencil,
	Percent,
	Timer,
	Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SegmentedBar } from "#/components/dashboard-charts";
import { PageHeader } from "#/components/page-header";
import { Button, buttonVariants } from "#/components/ui/button";
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
	DialogTrigger,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Skeleton } from "#/components/ui/skeleton";
import { useAuth } from "#/lib/auth";
import { type BookerDashboard, fetchBookerDashboard } from "#/lib/dashboard";
import {
	formatDate,
	formatDurationMinutes,
	formatPercent,
	formatTimeRange,
} from "#/lib/format";
import { supabase } from "#/lib/supabase";
import { useBookingsRealtime } from "#/lib/use-realtime";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/dashboard/")({
	component: DashboardPage,
});

function BookerStatCard({
	label,
	value,
	detail,
	icon: Icon,
	tone,
}: {
	label: string;
	value: string;
	detail: string;
	icon: LucideIcon;
	tone: string;
}) {
	return (
		<Card className="border-border/70">
			<CardContent className="flex items-center justify-between pt-6">
				<div className="min-w-0">
					<p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
						{label}
					</p>
					<p className="mt-1 truncate font-[Fraunces,Georgia,serif] text-2xl font-bold">
						{value}
					</p>
					<p className="mt-1 truncate text-xs text-muted-foreground">
						{detail}
					</p>
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

function DashboardPage() {
	const { user, profile, loading: authLoading, refreshProfile } = useAuth();
	const [data, setData] = useState<BookerDashboard | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [profileOpen, setProfileOpen] = useState(false);
	const [savingProfile, setSavingProfile] = useState(false);
	const [profileForm, setProfileForm] = useState({
		fullName: "",
		organization: "",
		phone: "",
	});

	const loadDashboard = useCallback(async () => {
		if (!user) return;
		try {
			const next = await fetchBookerDashboard();
			setData(next);
			setError(null);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Unable to load your dashboard.",
			);
		} finally {
			setLoading(false);
		}
	}, [user]);

	useEffect(() => {
		if (user) loadDashboard();
	}, [user, loadDashboard]);

	useBookingsRealtime(loadDashboard, Boolean(user));

	useEffect(() => {
		if (!profile) return;
		setProfileForm({
			fullName: profile.full_name ?? "",
			organization: profile.organization ?? "",
			phone: profile.phone ?? "",
		});
	}, [profile]);

	const handleProfileSave = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!user) return;
		setSavingProfile(true);
		const { error: updateError } = await supabase
			.from("profiles")
			.update({
				full_name: profileForm.fullName.trim() || null,
				organization: profileForm.organization.trim() || null,
				phone: profileForm.phone.trim() || null,
			})
			.eq("id", user.id);

		if (updateError) {
			toast.error(updateError.message);
			setSavingProfile(false);
			return;
		}

		await refreshProfile();
		toast.success("Profile updated");
		setSavingProfile(false);
		setProfileOpen(false);
	};

	if (authLoading || (user && loading)) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-9 w-56" />
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{["s1", "s2", "s3", "s4"].map((key) => (
						<Skeleton key={key} className="h-28 rounded-xl" />
					))}
				</div>
				<Skeleton className="h-72 rounded-xl" />
			</div>
		);
	}

	if (!user) return null;

	if (!data) {
		return (
			<div>
				<PageHeader
					eyebrow="Booker dashboard"
					title={`Hello${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
					description="Track your request activity and jump back into an upcoming booking."
				/>
				<Card className="mt-6 border-border/70">
					<CardContent className="py-10 text-center">
						<p className="font-semibold">Couldn’t load your dashboard</p>
						<p className="mt-1 text-sm text-muted-foreground">
							{error ?? "Try refreshing the page."}
						</p>
						<button
							type="button"
							onClick={loadDashboard}
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

	const { counts, waits, most_used_venue, attendees, next_booking } = data;
	const decided = counts.approved + counts.rejected;
	const pendingWaitMinutes =
		waits.avg_pending_wait_hours == null
			? null
			: waits.avg_pending_wait_hours * 60;

	return (
		<div>
			<PageHeader
				eyebrow="Booker dashboard"
				title={`Hello${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
				description="Track your request activity and jump back into an upcoming booking."
				action={
					<Link to="/book" className={cn(buttonVariants(), "no-underline")}>
						<CalendarPlus className="size-4" />
						New request
					</Link>
				}
			/>

			<div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<BookerStatCard
					label="Approval rate"
					value={formatPercent(counts.approval_rate)}
					detail={
						decided === 0
							? "No decisions yet"
							: `${counts.approved} of ${decided} decided requests`
					}
					icon={Percent}
					tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
				/>
				<BookerStatCard
					label="Avg decision wait"
					value={formatDurationMinutes(waits.avg_decision_wait_minutes)}
					detail={`${formatDurationMinutes(waits.median_decision_wait_minutes)} median`}
					icon={Timer}
					tone="bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
				/>
				<BookerStatCard
					label="Most-used venue"
					value={most_used_venue?.venue_name ?? "—"}
					detail={
						most_used_venue
							? `${most_used_venue.booking_count} request${most_used_venue.booking_count === 1 ? "" : "s"}`
							: "No venue history yet"
					}
					icon={MapPin}
					tone="bg-[#2451d8]/10 text-[#1c3fae] dark:bg-[#f0c75e]/10 dark:text-[#f0c75e]"
				/>
				<BookerStatCard
					label="Total attendees"
					value={String(attendees.total_attendees)}
					detail={`${attendees.approved_attendees} approved · ${attendees.upcoming_attendees} upcoming`}
					icon={Users}
					tone="bg-[#2451d8]/10 text-[#1c3fae] dark:bg-[#f0c75e]/10 dark:text-[#f0c75e]"
				/>
			</div>

			<div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
				<div className="space-y-6">
					<Card className="border-border/70">
						<CardHeader className="flex-row items-start justify-between gap-3">
							<div>
								<CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
									Up next
								</CardTitle>
								<CardDescription>
									Your nearest pending or approved request.
								</CardDescription>
							</div>
							<Link
								to="/dashboard/bookings"
								className={cn(
									buttonVariants({ variant: "ghost", size: "sm" }),
									"no-underline",
								)}
							>
								All bookings
								<ArrowRight className="size-4" />
							</Link>
						</CardHeader>
						<CardContent>
							{next_booking ? (
								<div className="rounded-xl border border-border/70 bg-background/60 p-4">
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="font-mono text-xs font-semibold text-muted-foreground">
												{next_booking.reference}
											</p>
											<p className="mt-1 truncate font-semibold">
												{next_booking.activity_name}
											</p>
											<p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
												<Building2 className="size-3.5" />
												{next_booking.venue?.name ?? "Unknown venue"}
											</p>
										</div>
										<div className="text-right text-sm">
											<p className="font-semibold">
												{formatDate(next_booking.booking_date)}
											</p>
											<p className="text-xs text-muted-foreground">
												{formatTimeRange(
													next_booking.start_time,
													next_booking.end_time,
												)}
											</p>
										</div>
									</div>
									<Link
										to="/bookings/$token"
										params={{ token: next_booking.public_token }}
										search={{ created: false }}
										className={cn(
											buttonVariants({ variant: "outline", size: "sm" }),
											"mt-4 no-underline",
										)}
									>
										View booking
										<ArrowRight className="size-4" />
									</Link>
								</div>
							) : (
								<div className="rounded-xl border border-dashed border-border/80 px-6 py-12 text-center">
									<p className="font-semibold">Nothing upcoming</p>
									<p className="mt-1 text-sm text-muted-foreground">
										Submit a request and it will show up here while it is
										pending or approved.
									</p>
									<Link
										to="/book"
										className={cn(
											buttonVariants({ variant: "outline", size: "sm" }),
											"mt-4 no-underline",
										)}
									>
										Request a venue
									</Link>
								</div>
							)}
						</CardContent>
					</Card>

					<Card className="border-border/70">
						<CardHeader>
							<CardTitle className="flex items-center gap-2 font-[Fraunces,Georgia,serif] text-xl">
								<Clock className="size-4 text-amber-600" />
								Request mix
							</CardTitle>
							<CardDescription>
								{counts.total} request{counts.total === 1 ? "" : "s"} ·{" "}
								{counts.pending} awaiting review
							</CardDescription>
						</CardHeader>
						<CardContent>
							<SegmentedBar
								total={counts.total}
								segments={[
									{
										label: "Approved",
										value: counts.approved,
										className: "bg-emerald-500",
									},
									{
										label: "Pending",
										value: counts.pending,
										className: "bg-amber-400",
									},
									{
										label: "Rejected",
										value: counts.rejected,
										className: "bg-rose-500",
									},
									{
										label: "Cancelled",
										value: counts.cancelled,
										className: "bg-zinc-400 dark:bg-zinc-600",
									},
								]}
							/>
							<div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
								{[
									{
										label: "Pending",
										value: counts.pending,
										dot: "bg-amber-400",
									},
									{
										label: "Approved",
										value: counts.approved,
										dot: "bg-emerald-500",
									},
									{
										label: "Rejected",
										value: counts.rejected,
										dot: "bg-rose-500",
									},
									{
										label: "Cancelled",
										value: counts.cancelled,
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
							<div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
								<span>
									Avg wait on pending requests:{" "}
									{formatDurationMinutes(pendingWaitMinutes)}
								</span>
								<span>
									{counts.upcoming} upcoming · {attendees.total_attendees} total
									attendees
								</span>
							</div>
						</CardContent>
					</Card>
				</div>

				<div className="space-y-4">
					<Card className="border-border/70">
						<CardHeader className="flex-row items-start justify-between gap-3">
							<div>
								<CardTitle className="text-base">Contact details</CardTitle>
								<CardDescription>
									Used to prefill new booking requests.
								</CardDescription>
							</div>
							<Dialog open={profileOpen} onOpenChange={setProfileOpen}>
								<DialogTrigger asChild>
									<Button
										variant="outline"
										size="icon-sm"
										aria-label="Edit profile"
									>
										<Pencil className="size-3.5" />
									</Button>
								</DialogTrigger>
								<DialogContent>
									<form onSubmit={handleProfileSave}>
										<DialogHeader>
											<DialogTitle>Edit contact details</DialogTitle>
											<DialogDescription>
												These details are only used for booking communication.
											</DialogDescription>
										</DialogHeader>
										<div className="grid gap-4 py-4">
											<div className="space-y-2">
												<Label htmlFor="profile-name">Full name</Label>
												<Input
													id="profile-name"
													value={profileForm.fullName}
													onChange={(event) =>
														setProfileForm((current) => ({
															...current,
															fullName: event.target.value,
														}))
													}
												/>
											</div>
											<div className="space-y-2">
												<Label htmlFor="profile-org">Organization</Label>
												<Input
													id="profile-org"
													value={profileForm.organization}
													onChange={(event) =>
														setProfileForm((current) => ({
															...current,
															organization: event.target.value,
														}))
													}
												/>
											</div>
											<div className="space-y-2">
												<Label htmlFor="profile-phone">Phone</Label>
												<Input
													id="profile-phone"
													type="tel"
													value={profileForm.phone}
													onChange={(event) =>
														setProfileForm((current) => ({
															...current,
															phone: event.target.value,
														}))
													}
												/>
											</div>
										</div>
										<DialogFooter>
											<Button
												type="button"
												variant="outline"
												onClick={() => setProfileOpen(false)}
											>
												Cancel
											</Button>
											<Button type="submit" disabled={savingProfile}>
												{savingProfile ? "Saving…" : "Save changes"}
											</Button>
										</DialogFooter>
									</form>
								</DialogContent>
							</Dialog>
						</CardHeader>
						<CardContent className="space-y-2 text-sm">
							<p className="font-semibold">
								{profile?.full_name || "No name set"}
							</p>
							<p className="text-muted-foreground">
								{profile?.email ?? user.email}
							</p>
							<p className="text-muted-foreground">
								{profile?.organization || "No organization set"}
							</p>
							<p className="text-muted-foreground">
								{profile?.phone || "No phone set"}
							</p>
						</CardContent>
					</Card>

					<Card className="border-border/70">
						<CardHeader>
							<CardTitle className="text-base">Guest booking?</CardTitle>
							<CardDescription>
								Requests submitted before signing in are not listed here.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Link
								to="/bookings"
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
									"w-full no-underline",
								)}
							>
								Find a guest booking
							</Link>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
