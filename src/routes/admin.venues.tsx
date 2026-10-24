import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Building2,
	Loader2,
	MoreHorizontal,
	Pencil,
	Plus,
	Power,
	Search,
	Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DataPagination } from "#/components/data-pagination";
import { EmptyState } from "#/components/empty-state";
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
import { Badge } from "#/components/ui/badge";
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
	fetchVenueBookingCounts,
	fetchVenueById,
	fetchVenueCounts,
	fetchVenuesPage,
	type VenueFilter,
} from "#/lib/admin-queries";
import { slugify } from "#/lib/format";
import { supabase } from "#/lib/supabase";
import type { Venue } from "#/lib/types";
import { useDebouncedValue } from "#/lib/use-debounced-value";
import { useBookingsRealtime } from "#/lib/use-realtime";

interface AdminVenuesSearch {
	venue?: string;
}

export const Route = createFileRoute("/admin/venues")({
	validateSearch: (search: Record<string, unknown>): AdminVenuesSearch => ({
		venue:
			typeof search.venue === "string" && search.venue
				? search.venue
				: undefined,
	}),
	component: AdminVenues,
});

interface VenueFormState {
	name: string;
	slug: string;
	description: string;
	address: string;
	capacity: string;
	isActive: boolean;
}

const emptyForm: VenueFormState = {
	name: "",
	slug: "",
	description: "",
	address: "",
	capacity: "",
	isActive: true,
};

type SlugStatus = "idle" | "checking" | "available" | "taken" | "error";

function mapVenueError(error: { code?: string; message?: string }) {
	if (error.code === "23505") {
		return "A venue with that name or slug already exists.";
	}
	if (error.code === "23514") {
		return "Please check the venue name, slug, and capacity.";
	}
	return error.message ?? "Unable to save the venue.";
}

function VenueDialog({
	open,
	onOpenChange,
	venue,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	venue: Venue | null;
	onSaved: () => Promise<void> | void;
}) {
	const [form, setForm] = useState<VenueFormState>(emptyForm);
	const [slugTouched, setSlugTouched] = useState(false);
	const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		if (venue) {
			setForm({
				name: venue.name,
				slug: venue.slug,
				description: venue.description ?? "",
				address: venue.address ?? "",
				capacity: venue.capacity ? String(venue.capacity) : "",
				isActive: venue.is_active,
			});
			setSlugTouched(true);
		} else {
			setForm(emptyForm);
			setSlugTouched(false);
		}
		setError(null);
		setSlugStatus("idle");
	}, [open, venue]);

	useEffect(() => {
		if (!open || slugTouched) return;

		const timer = window.setTimeout(() => {
			const nextSlug = slugify(form.name);
			setForm((current) =>
				current.slug === nextSlug ? current : { ...current, slug: nextSlug },
			);
		}, 500);

		return () => window.clearTimeout(timer);
	}, [open, slugTouched, form.name]);

	useEffect(() => {
		if (!open) return;

		const normalizedSlug = form.slug.trim();
		if (!normalizedSlug) {
			setSlugStatus("idle");
			return;
		}

		let active = true;
		setSlugStatus("checking");
		const timer = window.setTimeout(async () => {
			let request = supabase
				.from("venues")
				.select("id")
				.eq("slug", normalizedSlug);

			if (venue) {
				request = request.neq("id", venue.id);
			}

			const { data, error: lookupError } = await request.limit(1);

			if (!active) return;

			if (lookupError) {
				setSlugStatus("error");
				return;
			}

			setSlugStatus(data && data.length > 0 ? "taken" : "available");
		}, 500);

		return () => {
			active = false;
			window.clearTimeout(timer);
		};
	}, [open, form.slug, venue]);

	const update = <Key extends keyof VenueFormState>(
		key: Key,
		value: VenueFormState[Key],
	) => {
		setForm((current) => ({ ...current, [key]: value }));
	};

	const handleNameChange = (value: string) => {
		setForm((current) => ({ ...current, name: value }));
	};

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		const normalizedSlug = form.slug.trim() || slugify(form.name);
		if (!form.name.trim() || !normalizedSlug) {
			setError("Venue name and slug are required.");
			return;
		}

		if (slugStatus === "checking") {
			setError("Please wait while we check slug availability.");
			return;
		}

		if (slugStatus === "taken") {
			setError("That slug is already in use. Choose a different one.");
			return;
		}

		setSaving(true);
		setError(null);
		const payload = {
			name: form.name.trim(),
			slug: normalizedSlug,
			description: form.description.trim() || null,
			address: form.address.trim() || null,
			capacity: form.capacity.trim() ? Number(form.capacity) : null,
			is_active: form.isActive,
		};

		const result = venue
			? await supabase.from("venues").update(payload).eq("id", venue.id)
			: await supabase.from("venues").insert(payload);

		if (result.error) {
			setError(mapVenueError(result.error));
			setSaving(false);
			return;
		}

		toast.success(venue ? "Venue updated" : "Venue created");
		setSaving(false);
		onOpenChange(false);
		await onSaved();
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>{venue ? "Edit venue" : "Add a venue"}</DialogTitle>
						<DialogDescription>
							Active venues can be selected by bookers right away.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="venue-name" required>
								Name
							</Label>
							<Input
								id="venue-name"
								value={form.name}
								onChange={(event) => handleNameChange(event.target.value)}
								placeholder="e.g. Main Auditorium"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="venue-slug" required>
								Slug
							</Label>
							<Input
								id="venue-slug"
								value={form.slug}
								onChange={(event) => {
									setSlugTouched(true);
									update("slug", event.target.value);
								}}
								placeholder="main-auditorium"
								required
							/>
							{slugStatus === "checking" ? (
								<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
									<Loader2 className="size-3 animate-spin" />
									Checking slug availability…
								</p>
							) : slugStatus === "available" ? (
								<p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
									Slug is available.
								</p>
							) : slugStatus === "taken" ? (
								<p className="text-xs font-medium text-destructive">
									That slug is already in use. Try another one.
								</p>
							) : slugStatus === "error" ? (
								<p className="text-xs font-medium text-amber-600 dark:text-amber-400">
									Couldn&apos;t verify this slug. It will be checked again when
									you save.
								</p>
							) : (
								<p className="text-xs text-muted-foreground">
									Lowercase identifier used in links. Generated from the name
									after you pause typing.
								</p>
							)}
						</div>
						<div className="space-y-2">
							<Label htmlFor="venue-description">Description</Label>
							<Textarea
								id="venue-description"
								value={form.description}
								onChange={(event) => update("description", event.target.value)}
								rows={3}
								placeholder="What is this space suitable for?"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="venue-address">Address</Label>
							<Input
								id="venue-address"
								value={form.address}
								onChange={(event) => update("address", event.target.value)}
							/>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="venue-capacity">Capacity</Label>
								<Input
									id="venue-capacity"
									type="number"
									min={1}
									step={1}
									value={form.capacity}
									onChange={(event) => update("capacity", event.target.value)}
									placeholder="Optional"
								/>
							</div>
							<div className="flex items-center gap-3 pt-7">
								<input
									id="venue-active"
									type="checkbox"
									checked={form.isActive}
									onChange={(event) => update("isActive", event.target.checked)}
									className="size-4 accent-[#2451d8]"
								/>
								<Label htmlFor="venue-active">Venue is active</Label>
							</div>
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
						<Button
							type="submit"
							disabled={
								saving || slugStatus === "checking" || slugStatus === "taken"
							}
						>
							{saving
								? "Saving…"
								: slugStatus === "checking"
									? "Checking slug…"
									: venue
										? "Save changes"
										: "Create venue"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function AdminVenues() {
	const [venues, setVenues] = useState<Venue[]>([]);
	const [bookingCounts, setBookingCounts] = useState<Record<string, number>>(
		{},
	);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState<VenueFilter>("all");
	const [query, setQuery] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [total, setTotal] = useState(0);
	const [totalAll, setTotalAll] = useState(0);
	const [activeCount, setActiveCount] = useState(0);
	const [refreshKey, setRefreshKey] = useState(0);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<Venue | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Venue | null>(null);
	const debouncedQuery = useDebouncedValue(query);
	const { venue: venueParam } = Route.useSearch();
	const navigate = Route.useNavigate();

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey intentionally retriggers the query after mutations.
	useEffect(() => {
		let active = true;
		setLoading(true);

		Promise.all([
			fetchVenuesPage({ page, pageSize, filter, query: debouncedQuery }),
			fetchVenueCounts(),
		])
			.then(async ([result, counts]) => {
				if (!active) return;
				const pageCount = Math.max(1, Math.ceil(result.total / pageSize));
				if (page > pageCount) {
					setPage(pageCount);
					return;
				}

				const nextBookingCounts = await fetchVenueBookingCounts(
					result.rows.map((venue) => venue.id),
				);
				if (!active) return;

				setVenues(result.rows);
				setBookingCounts(nextBookingCounts);
				setTotal(result.total);
				setTotalAll(counts.total);
				setActiveCount(counts.active);
				setLoading(false);
			})
			.catch((error: unknown) => {
				if (!active) return;
				toast.error(
					error instanceof Error ? error.message : "Unable to load venues.",
				);
				setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [page, pageSize, filter, debouncedQuery, refreshKey]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: navigate is stable; venueParam is the trigger.
	useEffect(() => {
		if (!venueParam) return;

		let active = true;
		fetchVenueById(venueParam)
			.then((venue) => {
				if (!active) return;
				if (!venue) {
					toast.error("That venue could not be found.");
					navigate({
						to: "/admin/venues",
						search: { venue: undefined },
						replace: true,
					});
					return;
				}
				setEditing(venue);
				setDialogOpen(true);
			})
			.catch((error: unknown) => {
				if (!active) return;
				toast.error(
					error instanceof Error ? error.message : "Unable to load venue.",
				);
				navigate({
					to: "/admin/venues",
					search: { venue: undefined },
					replace: true,
				});
			});

		return () => {
			active = false;
		};
	}, [venueParam]);

	const closeVenueDialog = () => {
		setDialogOpen(false);
		if (venueParam) {
			navigate({
				to: "/admin/venues",
				search: { venue: undefined },
				replace: true,
			});
		}
	};

	const refresh = () => setRefreshKey((key) => key + 1);
	useBookingsRealtime(refresh);

	const toggleActive = async (venue: Venue) => {
		const { error } = await supabase
			.from("venues")
			.update({ is_active: !venue.is_active })
			.eq("id", venue.id);

		if (error) {
			toast.error(error.message);
			return;
		}

		toast.success(venue.is_active ? "Venue deactivated" : "Venue activated");
		refresh();
	};

	const removeVenue = async (venue: Venue) => {
		const { error } = await supabase.from("venues").delete().eq("id", venue.id);

		if (error) {
			if (error.code === "23503") {
				toast.error(
					"This venue is used by bookings or school events and cannot be deleted. Deactivate it instead.",
				);
			} else {
				toast.error(error.message);
			}
			return;
		}

		toast.success("Venue deleted");
		refresh();
	};

	return (
		<div>
			<PageHeader
				eyebrow="Availability control"
				title="Venues"
				description={`${totalAll} total · ${activeCount} active. Deactivate a venue to hide it from new requests.`}
				action={
					<Button
						onClick={() => {
							setEditing(null);
							setDialogOpen(true);
						}}
					>
						<Plus className="size-4" />
						Add venue
					</Button>
				}
			/>

			<Card className="mt-6 border-border/70">
				<CardHeader className="gap-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
								Venue directory
							</CardTitle>
							<CardDescription>
								{total} of {totalAll} venues · Upcoming active bookings are
								shown per venue.
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
								placeholder="Search name, slug, address…"
								className="pl-9"
							/>
						</div>
					</div>
					<Tabs
						value={filter}
						onValueChange={(value) => {
							setFilter(value as VenueFilter);
							setPage(1);
						}}
					>
						<TabsList>
							<TabsTrigger value="all">All</TabsTrigger>
							<TabsTrigger value="active">Active</TabsTrigger>
							<TabsTrigger value="inactive">Inactive</TabsTrigger>
						</TabsList>
					</Tabs>
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
							icon={Building2}
							title={totalAll === 0 ? "No venues yet" : "No venues found"}
							description={
								totalAll === 0
									? "Create the first venue so bookers can start submitting requests."
									: "Try a different status filter or search term."
							}
							action={
								<Button
									onClick={() => {
										setEditing(null);
										setDialogOpen(true);
									}}
								>
									<Plus className="size-4" />
									Add venue
								</Button>
							}
						/>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Venue</TableHead>
										<TableHead>Capacity</TableHead>
										<TableHead>Upcoming</TableHead>
										<TableHead>Status</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{venues.map((venue) => (
										<TableRow key={venue.id}>
											<TableCell className="max-w-64">
												<Link
													to="/admin/venues"
													search={{ venue: venue.id }}
													className="block truncate font-semibold underline-offset-4 hover:underline"
												>
													{venue.name}
												</Link>
												<p className="truncate font-mono text-[11px] text-muted-foreground">
													/{venue.slug}
												</p>
												{venue.address ? (
													<p className="truncate text-xs text-muted-foreground">
														{venue.address}
													</p>
												) : null}
											</TableCell>
											<TableCell>{venue.capacity ?? "—"}</TableCell>
											<TableCell>{bookingCounts[venue.id] ?? 0}</TableCell>
											<TableCell>
												<Badge
													variant="outline"
													className={
														venue.is_active
															? "border-emerald-300/60 bg-emerald-100 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-200"
															: "border-slate-300/60 bg-slate-100 text-slate-700 dark:border-slate-400/30 dark:bg-slate-400/15 dark:text-slate-200"
													}
												>
													{venue.is_active ? "Active" : "Inactive"}
												</Badge>
											</TableCell>
											<TableCell className="text-right">
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															size="icon"
															aria-label={`Actions for ${venue.name}`}
														>
															<MoreHorizontal className="size-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															onSelect={() => {
																setEditing(venue);
																setDialogOpen(true);
															}}
														>
															<Pencil className="size-4" />
															Edit venue
														</DropdownMenuItem>
														<DropdownMenuItem
															onSelect={() => toggleActive(venue)}
														>
															<Power className="size-4" />
															{venue.is_active ? "Deactivate" : "Activate"}
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															onSelect={() => setDeleteTarget(venue)}
															className="text-destructive focus:text-destructive"
														>
															<Trash2 className="size-4" />
															Delete venue
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
							itemLabel="venues"
							onPageChange={setPage}
							onPageSizeChange={(size) => {
								setPageSize(size);
								setPage(1);
							}}
						/>
					) : null}
				</CardContent>
			</Card>

			<VenueDialog
				open={dialogOpen}
				onOpenChange={(open) => {
					if (open) setDialogOpen(true);
					else closeVenueDialog();
				}}
				venue={editing}
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
							Delete {deleteTarget?.name ?? "venue"}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							Venues used by bookings or school events cannot be deleted.
							Deactivate the venue instead to hide it from new requests. This
							action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (deleteTarget) removeVenue(deleteTarget);
							}}
						>
							Delete venue
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
