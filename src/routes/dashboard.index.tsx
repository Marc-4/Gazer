import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Building2,
	CalendarDays,
	CalendarPlus,
	CheckCircle2,
	Clock,
	Pencil,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { formatDate, formatTimeRange, todayIsoDate } from "#/lib/format";
import { supabase } from "#/lib/supabase";
import type { BookingWithVenue } from "#/lib/types";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/dashboard/")({
	component: DashboardPage,
});

function DashboardPage() {
	const { user, profile, loading: authLoading, refreshProfile } = useAuth();
	const [bookings, setBookings] = useState<BookingWithVenue[]>([]);
	const [loading, setLoading] = useState(true);
	const [profileOpen, setProfileOpen] = useState(false);
	const [savingProfile, setSavingProfile] = useState(false);
	const [profileForm, setProfileForm] = useState({
		fullName: "",
		organization: "",
		phone: "",
	});

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

	useEffect(() => {
		if (!profile) return;
		setProfileForm({
			fullName: profile.full_name ?? "",
			organization: profile.organization ?? "",
			phone: profile.phone ?? "",
		});
	}, [profile]);

	const today = todayIsoDate();

	const stats = useMemo(
		() => ({
			total: bookings.length,
			pending: bookings.filter((booking) => booking.status === "pending")
				.length,
			approved: bookings.filter((booking) => booking.status === "approved")
				.length,
			upcoming: bookings.filter(
				(booking) =>
					booking.booking_date >= today &&
					(booking.status === "pending" || booking.status === "approved"),
			).length,
		}),
		[bookings, today],
	);

	const nextBooking = useMemo(
		() =>
			bookings
				.filter(
					(booking) =>
						booking.booking_date >= today &&
						(booking.status === "pending" || booking.status === "approved"),
				)
				.sort((a, b) => a.booking_date.localeCompare(b.booking_date))[0] ??
			null,
		[bookings, today],
	);

	const handleProfileSave = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!user) return;
		setSavingProfile(true);
		const { error } = await supabase
			.from("profiles")
			.update({
				full_name: profileForm.fullName.trim() || null,
				organization: profileForm.organization.trim() || null,
				phone: profileForm.phone.trim() || null,
			})
			.eq("id", user.id);

		if (error) {
			toast.error(error.message);
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
				{[
					{ label: "Total requests", value: stats.total, icon: CalendarDays },
					{ label: "Awaiting review", value: stats.pending, icon: Clock },
					{ label: "Approved", value: stats.approved, icon: CheckCircle2 },
					{ label: "Upcoming", value: stats.upcoming, icon: Building2 },
				].map((stat) => (
					<Card key={stat.label} className="border-border/70">
						<CardContent className="flex items-center justify-between pt-6">
							<div>
								<p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
									{stat.label}
								</p>
								<p className="mt-1 font-[Fraunces,Georgia,serif] text-3xl font-bold">
									{stat.value}
								</p>
							</div>
							<span className="grid size-10 place-items-center rounded-xl bg-[#2451d8]/10 text-[#1c3fae] dark:bg-[#f0c75e]/10 dark:text-[#f0c75e]">
								<stat.icon className="size-5" />
							</span>
						</CardContent>
					</Card>
				))}
			</div>

			<div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
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
						{nextBooking ? (
							<div className="rounded-xl border border-border/70 bg-background/60 p-4">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="font-mono text-xs font-semibold text-muted-foreground">
											{nextBooking.reference}
										</p>
										<p className="mt-1 truncate font-semibold">
											{nextBooking.activity_name}
										</p>
										<p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
											<Building2 className="size-3.5" />
											{nextBooking.venue?.name ?? "Unknown venue"}
										</p>
									</div>
									<div className="text-right text-sm">
										<p className="font-semibold">
											{formatDate(nextBooking.booking_date)}
										</p>
										<p className="text-xs text-muted-foreground">
											{formatTimeRange(
												nextBooking.start_time,
												nextBooking.end_time,
											)}
										</p>
									</div>
								</div>
								<Link
									to="/bookings/$token"
									params={{ token: nextBooking.public_token }}
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
									Submit a request and it will show up here while it is pending
									or approved.
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
