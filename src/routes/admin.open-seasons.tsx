import { createFileRoute } from "@tanstack/react-router";
import {
	CalendarClock,
	CheckCircle2,
	MoreHorizontal,
	Pencil,
	Plus,
	Power,
	Search,
	Sparkles,
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
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Textarea } from "#/components/ui/textarea";
import {
	fetchOpenSeasonCounts,
	fetchOpenSeasonsPage,
	type OpenSeasonFilter,
} from "#/lib/admin-queries";
import {
    DEFAULT_END_TIME,
	DEFAULT_START_TIME,
	formatDateTime,
	fromDateTimeLocal,
	toDateTimeLocal,
	todayAtTimeLocal,
} from "#/lib/format";
import { supabase } from "#/lib/supabase";
import type { OpenSeason } from "#/lib/types";
import { useDebouncedValue } from "#/lib/use-debounced-value";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/admin/open-seasons")({
	component: AdminOpenSeasons,
});

interface SeasonFormState {
	name: string;
	description: string;
	startsAt: string;
	endsAt: string;
	isEnabled: boolean;
}

function createEmptyForm(): SeasonFormState {
	return {
		name: "",
		description: "",
		startsAt: todayAtTimeLocal(DEFAULT_START_TIME),
		endsAt: todayAtTimeLocal(DEFAULT_END_TIME),
		isEnabled: true,
	};
}

function mapSeasonError(error: { code?: string; message?: string }) {
	if (error.code === "23P01") {
		return "This enabled season overlaps another enabled open season.";
	}
	if (error.code === "23514") {
		return "The end date must be after the start date.";
	}
	if (error.code === "23505") {
		return "This open season conflicts with an existing one.";
	}
	return error.message ?? "Unable to save the open season.";
}

function seasonState(season: OpenSeason, now: number) {
	if (!season.is_enabled) return "Disabled";
	if (new Date(season.starts_at).getTime() > now) return "Upcoming";
	if (new Date(season.ends_at).getTime() <= now) return "Ended";
	return "Active";
}

function SeasonDialog({
	open,
	onOpenChange,
	season,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	season: OpenSeason | null;
	onSaved: () => Promise<void> | void;
}) {
	const [form, setForm] = useState<SeasonFormState>(createEmptyForm);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setForm(
			season
				? {
						name: season.name,
						description: season.description ?? "",
						startsAt: toDateTimeLocal(season.starts_at),
						endsAt: toDateTimeLocal(season.ends_at),
						isEnabled: season.is_enabled,
					}
				: createEmptyForm(),
		);
		setError(null);
	}, [open, season]);

	const update = <Key extends keyof SeasonFormState>(
		key: Key,
		value: SeasonFormState[Key],
	) => {
		setForm((current) => ({ ...current, [key]: value }));
	};

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!form.name.trim()) {
			setError("A season name is required.");
			return;
		}
		if (!form.startsAt || !form.endsAt) {
			setError("Start and end date-time are required.");
			return;
		}
		if (new Date(form.endsAt) <= new Date(form.startsAt)) {
			setError("The end date must be after the start date.");
			return;
		}

		setSaving(true);
		setError(null);
		const payload = {
			name: form.name.trim(),
			description: form.description.trim() || null,
			starts_at: fromDateTimeLocal(form.startsAt),
			ends_at: fromDateTimeLocal(form.endsAt),
			is_enabled: form.isEnabled,
		};

		const result = season
			? await supabase.from("open_seasons").update(payload).eq("id", season.id)
			: await supabase.from("open_seasons").insert(payload);

		if (result.error) {
			setError(mapSeasonError(result.error));
			setSaving(false);
			return;
		}

		toast.success(season ? "Open season updated" : "Open season created");
		setSaving(false);
		onOpenChange(false);
		await onSaved();
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>
							{season ? "Edit open season" : "Create open season"}
						</DialogTitle>
						<DialogDescription>
							During an enabled season, available requests are approved
							automatically. Enabled seasons cannot overlap.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="season-name" required>
								Name
							</Label>
							<Input
								id="season-name"
								value={form.name}
								onChange={(event) => update("name", event.target.value)}
								placeholder="e.g. Spring 2027 intake"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="season-description">Description</Label>
							<Textarea
								id="season-description"
								value={form.description}
								onChange={(event) => update("description", event.target.value)}
								rows={3}
								placeholder="Explain what this window is for."
							/>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="season-start" required>
									Starts at
								</Label>
								<Input
									id="season-start"
									type="datetime-local"
									value={form.startsAt}
									onChange={(event) => update("startsAt", event.target.value)}
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="season-end" required>
									Ends at
								</Label>
								<Input
									id="season-end"
									type="datetime-local"
									value={form.endsAt}
									onChange={(event) => update("endsAt", event.target.value)}
									required
								/>
							</div>
						</div>
						<div className="flex items-center gap-3">
							<input
								id="season-enabled"
								type="checkbox"
								checked={form.isEnabled}
								onChange={(event) => update("isEnabled", event.target.checked)}
								className="size-4 accent-[#2451d8]"
							/>
							<Label htmlFor="season-enabled">
								Enable automatic approval for this window
							</Label>
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
						<Button type="submit" disabled={saving}>
							{saving ? "Saving…" : season ? "Save changes" : "Create season"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function AdminOpenSeasons() {
	const [seasons, setSeasons] = useState<OpenSeason[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState<OpenSeasonFilter>("all");
	const [query, setQuery] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [total, setTotal] = useState(0);
	const [totalAll, setTotalAll] = useState(0);
	const [activeCount, setActiveCount] = useState(0);
	const [refreshKey, setRefreshKey] = useState(0);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<OpenSeason | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<OpenSeason | null>(null);
	const [running, setRunning] = useState(false);
	const debouncedQuery = useDebouncedValue(query);
	const now = Date.now();
	const hasActiveSeason = activeCount > 0;

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey intentionally retriggers the query after mutations.
	useEffect(() => {
		let active = true;
		setLoading(true);

		Promise.all([
			fetchOpenSeasonsPage({
				page,
				pageSize,
				filter,
				query: debouncedQuery,
			}),
			fetchOpenSeasonCounts(),
		])
			.then(([result, counts]) => {
				if (!active) return;
				const pageCount = Math.max(1, Math.ceil(result.total / pageSize));
				if (page > pageCount) {
					setPage(pageCount);
					return;
				}
				setSeasons(result.rows);
				setTotal(result.total);
				setTotalAll(counts.total);
				setActiveCount(counts.active);
				setLoading(false);
			})
			.catch((error: unknown) => {
				if (!active) return;
				toast.error(
					error instanceof Error
						? error.message
						: "Unable to load open seasons.",
				);
				setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [page, pageSize, filter, debouncedQuery, refreshKey]);

	const refresh = () => setRefreshKey((key) => key + 1);

	const toggleEnabled = async (season: OpenSeason) => {
		const { error } = await supabase
			.from("open_seasons")
			.update({ is_enabled: !season.is_enabled })
			.eq("id", season.id);

		if (error) {
			toast.error(mapSeasonError(error));
			return;
		}

		toast.success(
			season.is_enabled ? "Open season disabled" : "Open season enabled",
		);
		refresh();
	};

	const runAutoApproval = async () => {
		setRunning(true);
		const { data, error } = await supabase.rpc("auto_approve_pending_bookings");

		if (error) {
			toast.error(error.message);
			setRunning(false);
			return;
		}

		toast.success(
			`${data ?? 0} pending ${Number(data) === 1 ? "booking" : "bookings"} auto-approved`,
		);
		refresh();
		setRunning(false);
	};

	const removeSeason = async (season: OpenSeason) => {
		const { error } = await supabase
			.from("open_seasons")
			.delete()
			.eq("id", season.id);

		if (error) {
			toast.error(error.message);
			return;
		}

		toast.success("Open season deleted");
		setDeleteTarget(null);
		refresh();
	};

	return (
		<div>
			<PageHeader
				eyebrow="Automation"
				title="Open seasons"
				description={`${totalAll} total · ${activeCount} active. Set windows where requests are auto-approved when the venue and time slot are available.`}
				action={
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							onClick={runAutoApproval}
							disabled={running || !hasActiveSeason}
							title={
								hasActiveSeason
									? undefined
									: "Start an open season to enable auto-approval."
							}
						>
							<CheckCircle2 className="size-4" />
							{running ? "Approving…" : "Auto-approve pending"}
						</Button>
						<Button
							onClick={() => {
								setEditing(null);
								setDialogOpen(true);
							}}
						>
							<Plus className="size-4" />
							New season
						</Button>
					</div>
				}
			/>

			<div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<Tabs
					value={filter}
					onValueChange={(value) => {
						setFilter(value as OpenSeasonFilter);
						setPage(1);
					}}
				>
					<TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
						<TabsTrigger value="all">All</TabsTrigger>
						<TabsTrigger value="active">Active</TabsTrigger>
						<TabsTrigger value="upcoming">Upcoming</TabsTrigger>
						<TabsTrigger value="ended">Ended</TabsTrigger>
						<TabsTrigger value="disabled">Disabled</TabsTrigger>
					</TabsList>
				</Tabs>
				<div className="relative w-full sm:w-72">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							setPage(1);
						}}
						placeholder="Search name or description…"
						className="pl-9"
					/>
				</div>
			</div>

			{loading ? (
				<div className="mt-6 grid gap-4 md:grid-cols-2">
					{["s1", "s2"].map((key) => (
						<Skeleton key={key} className="h-48 rounded-xl" />
					))}
				</div>
			) : total === 0 ? (
				<div className="mt-6">
					<EmptyState
						icon={CalendarClock}
						title={totalAll === 0 ? "No open seasons" : "No open seasons found"}
						description={
							totalAll === 0
								? "Without an open season, every request requires manual admin review."
								: "Try a different state filter or search term."
						}
						action={
							<Button
								onClick={() => {
									setEditing(null);
									setDialogOpen(true);
								}}
							>
								<Plus className="size-4" />
								Create season
							</Button>
						}
					/>
				</div>
			) : (
				<div className="mt-6 grid gap-4 md:grid-cols-2">
					{seasons.map((season) => {
						const state = seasonState(season, now);
						return (
							<Card key={season.id} className="border-border/70">
								<CardHeader className="flex-row items-start justify-between gap-3">
									<div>
										<div className="flex flex-wrap items-center gap-2">
											<Badge
												variant="outline"
												className={cn(
													state === "Active" &&
														"border-emerald-300/60 bg-emerald-100 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-200",
													state === "Upcoming" &&
														"border-sky-300/60 bg-sky-100 text-sky-900 dark:border-sky-400/30 dark:bg-sky-400/15 dark:text-sky-200",
													state === "Ended" &&
														"border-slate-300/60 bg-slate-100 text-slate-700 dark:border-slate-400/30 dark:bg-slate-400/15 dark:text-slate-200",
													state === "Disabled" &&
														"border-amber-300/60 bg-amber-100 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-200",
												)}
											>
												{state === "Active" ? (
													<Sparkles className="mr-1 size-3" />
												) : null}
												{state}
											</Badge>
											<p className="font-mono text-[11px] text-muted-foreground">
												{season.id.slice(0, 8)}
											</p>
										</div>
										<CardTitle className="mt-2 font-[Fraunces,Georgia,serif] text-xl">
											{season.name}
										</CardTitle>
										<CardDescription className="line-clamp-2">
											{season.description ?? "No description provided."}
										</CardDescription>
									</div>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												aria-label={`Actions for ${season.name}`}
											>
												<MoreHorizontal className="size-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem
												onSelect={() => {
													setEditing(season);
													setDialogOpen(true);
												}}
											>
												<Pencil className="size-4" />
												Edit season
											</DropdownMenuItem>
											<DropdownMenuItem onSelect={() => toggleEnabled(season)}>
												<Power className="size-4" />
												{season.is_enabled ? "Disable" : "Enable"}
											</DropdownMenuItem>
											<DropdownMenuSeparator />
											<DropdownMenuItem
												onSelect={() => setDeleteTarget(season)}
												className="text-destructive focus:text-destructive"
											>
												<Trash2 className="size-4" />
												Delete season
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</CardHeader>
								<CardContent className="space-y-2 text-sm">
									<div className="rounded-lg border border-border/70 bg-muted/40 p-3">
										<p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
											Window
										</p>
										<p className="mt-1 font-medium">
											{formatDateTime(season.starts_at)}
										</p>
										<p className="text-xs text-muted-foreground">
											until {formatDateTime(season.ends_at)}
										</p>
									</div>
									<p className="text-xs text-muted-foreground">
										Created {formatDateTime(season.created_at)}
									</p>
								</CardContent>
							</Card>
						);
					})}
				</div>
			)}
			{!loading && total > 0 ? (
				<DataPagination
					page={page}
					pageSize={pageSize}
					total={total}
					itemLabel="open seasons"
					onPageChange={setPage}
					onPageSizeChange={(size) => {
						setPageSize(size);
						setPage(1);
					}}
				/>
			) : null}

			<SeasonDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				season={editing}
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
							Delete {deleteTarget?.name ?? "open season"}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This only removes the automation window. Existing bookings keep
							their current status. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (deleteTarget) removeSeason(deleteTarget);
							}}
						>
							Delete season
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
