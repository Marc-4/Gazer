import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Building2,
	CalendarDays,
	CalendarPlus,
	CheckCircle2,
	MapPin,
	School,
	Search,
	Settings2,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardTitle,
} from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { useAuth } from "#/lib/auth";
import { formatDate } from "#/lib/format";
import { supabase } from "#/lib/supabase";
import type { OpenSeason, Venue } from "#/lib/types";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	const { isAdmin } = useAuth();
	const [venues, setVenues] = useState<Venue[]>([]);
	const [openSeason, setOpenSeason] = useState<OpenSeason | null>(null);
	const [loading, setLoading] = useState(true);

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
			setVenues((venuesResult.data as Venue[] | null) ?? []);
			setOpenSeason((seasonResult.data as OpenSeason | null) ?? null);
			setLoading(false);
		}

		load();
		return () => {
			active = false;
		};
	}, []);

	return (
		<div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<div className="flex flex-col gap-5 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="island-kicker text-xs font-bold uppercase tracking-[0.16em]">
						NBSC Activity Booking System
					</p>
					<h1 className="mt-2 font-[Fraunces,Georgia,serif] text-4xl font-bold tracking-tight">
						Book a venue
					</h1>
					<p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
						Choose a space, pick a date, and submit a request. Each venue can
						host one approved booking per time slot. Pending requests may
						overlap until an administrator approves one, and school events
						reserve the whole date.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Link to="/book" className={cn(buttonVariants(), "no-underline")}>
						<CalendarPlus className="size-4" />
						New request
					</Link>
					<Link
						to="/bookings"
						className={cn(
							buttonVariants({ variant: "outline" }),
							"no-underline",
						)}
					>
						<Search className="size-4" />
						Check status
					</Link>
				</div>
			</div>

			{openSeason ? (
				<div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 dark:border-amber-400/20 dark:bg-amber-400/10">
					<CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
					<p className="text-sm text-amber-900 dark:text-amber-100">
						<span className="font-semibold">{openSeason.name}</span> is active
						until {formatDate(openSeason.ends_at.slice(0, 10))}. Available
						requests are approved automatically.
					</p>
				</div>
			) : null}

			{isAdmin ? (
				<Card className="mt-6 border-[#2451d8]/25 bg-[#2451d8]/5 dark:border-[#f0c75e]/20 dark:bg-[#f0c75e]/5">
					<CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="text-sm font-semibold">Administrator access</p>
							<p className="text-xs text-muted-foreground">
								Manage venues, bookings, open seasons, and email delivery.
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<Link
								to="/admin/venues"
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
									"no-underline",
								)}
							>
								<Settings2 className="size-4" />
								Manage venues
							</Link>
							<Link
								to="/admin/events"
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
									"no-underline",
								)}
							>
								<School className="size-4" />
								School events
							</Link>
							<Link
								to="/admin/calendar"
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
									"no-underline",
								)}
							>
								<CalendarDays className="size-4" />
								Calendar
							</Link>
							<Link
								to="/admin"
								className={cn(buttonVariants({ size: "sm" }), "no-underline")}
							>
								Admin console
								<ArrowRight className="size-4" />
							</Link>
						</div>
					</CardContent>
				</Card>
			) : null}

			<section className="mt-8">
				<div className="flex items-center justify-between gap-3">
					<h2 className="font-[Fraunces,Georgia,serif] text-2xl font-bold">
						Venues
					</h2>
					{!loading ? (
						<Badge variant="secondary">{venues.length} available</Badge>
					) : null}
				</div>

				<div className="mt-4 space-y-3">
					{loading
						? ["s1", "s2", "s3"].map((key) => (
								<Card key={key} className="border-border/70">
									<CardContent className="space-y-3 pt-6">
										<Skeleton className="h-5 w-44" />
										<Skeleton className="h-4 w-full" />
										<Skeleton className="h-4 w-2/3" />
									</CardContent>
								</Card>
							))
						: venues.map((venue) => (
								<Card key={venue.id} className="border-border/70">
									<CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#2451d8]/10 text-[#2451d8] dark:bg-[#f0c75e]/10 dark:text-[#f0c75e]">
													<Building2 className="size-4" />
												</span>
												<CardTitle className="font-[Fraunces,Georgia,serif] text-lg">
													{venue.name}
												</CardTitle>
											</div>
											{venue.description ? (
												<CardDescription className="mt-2 line-clamp-2">
													{venue.description}
												</CardDescription>
											) : null}
											<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
												{venue.address ? (
													<span className="flex items-center gap-1">
														<MapPin className="size-3" />
														{venue.address}
													</span>
												) : null}
												{venue.capacity ? (
													<span className="flex items-center gap-1">
														<Users className="size-3" />
														{venue.capacity} people
													</span>
												) : null}
											</div>
										</div>
										<Link
											to="/book"
											search={{ venue: venue.id }}
											className={cn(
												buttonVariants({ variant: "outline", size: "sm" }),
												"shrink-0 no-underline",
											)}
										>
											Request
											<ArrowRight className="size-4" />
										</Link>
									</CardContent>
								</Card>
							))}
				</div>

				{!loading && venues.length === 0 ? (
					<Card className="mt-4 border-dashed border-border/70">
						<CardContent className="py-10 text-center">
							<Building2 className="mx-auto size-6 text-muted-foreground" />
							<p className="mt-3 font-semibold">No venues available</p>
							<p className="mt-1 text-sm text-muted-foreground">
								{isAdmin
									? "Create a venue from the admin console to start accepting requests."
									: "Please check back later or contact the organizing team."}
							</p>
							{isAdmin ? (
								<Link
									to="/admin/venues"
									className={cn(buttonVariants(), "mt-4 no-underline")}
								>
									Create a venue
								</Link>
							) : null}
						</CardContent>
					</Card>
				) : null}
			</section>
		</div>
	);
}
