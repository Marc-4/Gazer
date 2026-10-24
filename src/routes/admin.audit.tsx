import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, History, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DataPagination } from "#/components/data-pagination";
import { EmptyState } from "#/components/empty-state";
import { PageHeader } from "#/components/page-header";
import { BookingStatusBadge } from "#/components/status-badge";
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
import {
	type AuditLogFilter,
	countAuditLogEntries,
	fetchAuditLogPage,
} from "#/lib/admin-queries";
import { formatDate, formatDateTime, formatTimeRange } from "#/lib/format";
import type { AuditLogEntry } from "#/lib/types";
import { useDebouncedValue } from "#/lib/use-debounced-value";
import { useBookingStatusHistoryRealtime } from "#/lib/use-realtime";

export const Route = createFileRoute("/admin/audit")({
	component: AdminAuditLog,
});

const filters: Array<{ value: AuditLogFilter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "pending", label: "Pending" },
	{ value: "approved", label: "Approved" },
	{ value: "rejected", label: "Rejected" },
	{ value: "cancelled", label: "Cancelled" },
];

function AdminAuditLog() {
	const [entries, setEntries] = useState<AuditLogEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState<AuditLogFilter>("all");
	const [query, setQuery] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [total, setTotal] = useState(0);
	const [totalAll, setTotalAll] = useState(0);
	const [refreshKey, setRefreshKey] = useState(0);
	const debouncedQuery = useDebouncedValue(query);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey intentionally retriggers the query after realtime changes.
	useEffect(() => {
		let active = true;
		setLoading(true);

		Promise.all([
			fetchAuditLogPage({ page, pageSize, filter, query: debouncedQuery }),
			countAuditLogEntries(),
		])
			.then(([result, allCount]) => {
				if (!active) return;
				const pageCount = Math.max(1, Math.ceil(result.total / pageSize));
				if (page > pageCount) {
					setPage(pageCount);
					return;
				}
				setEntries(result.rows);
				setTotal(result.total);
				setTotalAll(allCount);
				setLoading(false);
			})
			.catch((error: unknown) => {
				if (!active) return;
				toast.error(
					error instanceof Error ? error.message : "Unable to load audit log.",
				);
				setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [page, pageSize, filter, debouncedQuery, refreshKey]);

	const refresh = () => setRefreshKey((key) => key + 1);
	useBookingStatusHistoryRealtime(refresh);

	return (
		<div>
			<PageHeader
				eyebrow="Accountability"
				title="Audit log"
				description="Every booking status change, who made it, and when it happened."
			/>

			<Card className="mt-6 border-border/70">
				<CardHeader className="gap-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
								Status history
							</CardTitle>
							<CardDescription>
								{total} of {totalAll} entries
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
								placeholder="Search booking, actor, note…"
								className="pl-9"
							/>
						</div>
					</div>
					<Tabs
						value={filter}
						onValueChange={(value) => {
							setFilter(value as AuditLogFilter);
							setPage(1);
						}}
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
					{loading ? (
						<div className="space-y-2">
							{["s1", "s2", "s3", "s4", "s5", "s6"].map((key) => (
								<Skeleton key={key} className="h-14 rounded-lg" />
							))}
						</div>
					) : total === 0 ? (
						<EmptyState
							icon={History}
							title="No audit entries found"
							description={
								totalAll === 0
									? "Status changes will appear here as bookings are reviewed."
									: "Try a different status filter or search term."
							}
						/>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>When</TableHead>
										<TableHead>Booking</TableHead>
										<TableHead>Booking date</TableHead>
										<TableHead>Venue</TableHead>
										<TableHead>Change</TableHead>
										<TableHead>Changed by</TableHead>
										<TableHead>Note</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{entries.map((entry) => (
										<TableRow key={entry.id}>
											<TableCell className="whitespace-nowrap text-xs text-muted-foreground">
												{formatDateTime(entry.created_at)}
											</TableCell>
											<TableCell className="max-w-56">
												<Link
													to="/admin/bookings"
													search={{ review: entry.booking_id }}
													className="font-mono text-xs font-semibold text-foreground underline-offset-4 hover:underline"
												>
													{entry.reference}
												</Link>
												<p className="mt-0.5 truncate text-xs text-muted-foreground">
													{entry.activity_name} · {entry.requester_name}
												</p>
											</TableCell>
											<TableCell className="whitespace-nowrap">
												<Link
													to="/admin/calendar"
													search={{ date: entry.booking_date }}
													className="block underline-offset-4 hover:underline"
												>
													<p className="text-sm">
														{formatDate(entry.booking_date)}
													</p>
													<p className="text-xs text-muted-foreground">
														{formatTimeRange(entry.start_time, entry.end_time)}
													</p>
												</Link>
											</TableCell>
											<TableCell className="max-w-40 truncate text-sm">
												{entry.venue_id && entry.venue_name ? (
													<Link
														to="/admin/venues"
														search={{ venue: entry.venue_id }}
														className="underline-offset-4 hover:underline"
													>
														{entry.venue_name}
													</Link>
												) : (
													(entry.venue_name ?? "Unknown")
												)}
											</TableCell>
											<TableCell>
												<div className="flex items-center gap-2 whitespace-nowrap">
													{entry.from_status ? (
														<BookingStatusBadge status={entry.from_status} />
													) : (
														<span className="text-xs font-semibold text-muted-foreground">
															Created
														</span>
													)}
													<ArrowRight className="size-3 text-muted-foreground" />
													<BookingStatusBadge status={entry.to_status} />
												</div>
											</TableCell>
											<TableCell className="max-w-48">
												<p className="truncate text-sm">
													{entry.changed_by_name ??
														entry.changed_by_email ??
														"System"}
												</p>
												{entry.changed_by_email && entry.changed_by_name ? (
													<p className="truncate text-xs text-muted-foreground">
														{entry.changed_by_email}
													</p>
												) : null}
											</TableCell>
											<TableCell className="max-w-56 truncate text-sm text-muted-foreground">
												{entry.note || "—"}
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
							itemLabel="entries"
							onPageChange={setPage}
							onPageSizeChange={(size) => {
								setPageSize(size);
								setPage(1);
							}}
						/>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}
