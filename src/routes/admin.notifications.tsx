import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, RefreshCw, RotateCcw, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DataPagination } from "#/components/data-pagination";
import { EmptyState } from "#/components/empty-state";
import { PageHeader } from "#/components/page-header";
import { NotificationStatusBadge } from "#/components/status-badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
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
import {
	fetchOutboxCounts,
	fetchOutboxPage,
	type OutboxFilter,
} from "#/lib/admin-queries";
import { emailTemplateLabel, formatDateTime } from "#/lib/format";
import { supabase } from "#/lib/supabase";
import type { NotificationOutboxItem } from "#/lib/types";

export const Route = createFileRoute("/admin/notifications")({
	component: AdminNotifications,
});

const filters: Array<{ value: OutboxFilter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "pending", label: "Pending" },
	{ value: "sent", label: "Sent" },
	{ value: "failed", label: "Failed" },
];

interface DispatchResponse {
	ok?: boolean;
	processed?: number;
	sent?: number;
	failed?: number;
	skipped?: number;
	error?: string;
}

function AdminNotifications() {
	const [items, setItems] = useState<NotificationOutboxItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState<OutboxFilter>("all");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [total, setTotal] = useState(0);
	const [counts, setCounts] = useState({
		all: 0,
		pending: 0,
		sent: 0,
		failed: 0,
	});
	const [refreshKey, setRefreshKey] = useState(0);
	const [dispatching, setDispatching] = useState<"send" | "retry" | null>(null);
	const [automaticEmails, setAutomaticEmails] = useState(false);
	const [loadingSettings, setLoadingSettings] = useState(true);
	const [savingSettings, setSavingSettings] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey intentionally retriggers the query after dispatch.
	useEffect(() => {
		let active = true;
		setLoading(true);

		Promise.all([
			fetchOutboxPage({ page, pageSize, filter }),
			fetchOutboxCounts(),
		])
			.then(([result, nextCounts]) => {
				if (!active) return;
				const pageCount = Math.max(1, Math.ceil(result.total / pageSize));
				if (page > pageCount) {
					setPage(pageCount);
					return;
				}
				setItems(result.rows);
				setTotal(result.total);
				setCounts(nextCounts);
				setLoading(false);
			})
			.catch((error: unknown) => {
				if (!active) return;
				toast.error(
					error instanceof Error ? error.message : "Unable to load outbox.",
				);
				setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [page, pageSize, filter, refreshKey]);

	const loadSettings = useCallback(async () => {
		const { data, error } = await supabase
			.from("notification_settings")
			.select("automatic_emails_enabled")
			.eq("id", true)
			.maybeSingle();

		if (error) {
			toast.error(error.message);
			setLoadingSettings(false);
			return;
		}

		setAutomaticEmails(data?.automatic_emails_enabled ?? false);
		setLoadingSettings(false);
	}, []);

	useEffect(() => {
		loadSettings();
	}, [loadSettings]);

	const refresh = () => setRefreshKey((key) => key + 1);

	const toggleAutomaticEmails = async (enabled: boolean) => {
		setSavingSettings(true);
		try {
			const { error } = await supabase
				.from("notification_settings")
				.update({ automatic_emails_enabled: enabled })
				.eq("id", true);

			if (error) {
				toast.error(error.message);
				return;
			}

			setAutomaticEmails(enabled);
			toast.success(
				enabled
					? "Automatic email delivery enabled"
					: "Automatic email delivery disabled",
			);
		} finally {
			setSavingSettings(false);
		}
	};

	const dispatch = async (retryFailed: boolean) => {
		setDispatching(retryFailed ? "retry" : "send");
		try {
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				toast.error("Your session has expired. Please sign in again.");
				return;
			}

			const response = await fetch(
				`/api/notifications/dispatch${retryFailed ? "?retry=1" : ""}`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				},
			);

			const payload = (await response
				.json()
				.catch(() => ({}))) as DispatchResponse;

			if (!response.ok) {
				toast.error(payload.error ?? "Unable to dispatch notifications.");
				return;
			}

			toast.success(
				`Processed ${payload.processed ?? 0} · sent ${payload.sent ?? 0} · retrying ${payload.skipped ?? 0} · failed ${payload.failed ?? 0}`,
			);
			refresh();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Dispatch request failed.",
			);
		} finally {
			setDispatching(null);
		}
	};

	return (
		<div>
			<PageHeader
				eyebrow="Email delivery"
				title="Notification outbox"
				description="Transactional emails."
				action={
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={refresh}
							disabled={loading || Boolean(dispatching)}
						>
							<RefreshCw className="size-4" />
							Refresh
						</Button>
						{counts.failed > 0 ? (
							<Button
								variant="outline"
								size="sm"
								onClick={() => dispatch(true)}
								disabled={Boolean(dispatching)}
							>
								<RotateCcw className="size-4" />
								{dispatching === "retry"
									? "Retrying…"
									: `Retry failed (${counts.failed})`}
							</Button>
						) : null}
						<Button
							size="sm"
							onClick={() => dispatch(false)}
							disabled={Boolean(dispatching) || counts.pending === 0}
						>
							<Send className="size-4" />
							{dispatching === "send"
								? "Sending…"
								: `Send pending (${counts.pending})`}
						</Button>
					</div>
				}
			/>

			<Card className="mt-4 border-border/70">
				<CardContent>
					<div className="flex items-start gap-3">
						<input
							id="automatic-emails"
							type="checkbox"
							checked={automaticEmails}
							disabled={loadingSettings || savingSettings}
							onChange={(event) => toggleAutomaticEmails(event.target.checked)}
							className="mt-0.5 size-4 shrink-0 accent-[#2451d8] disabled:cursor-not-allowed disabled:opacity-50"
						/>
						<div className="space-y-1">
							<Label htmlFor="automatic-emails">
								Send emails automatically
								<span className="text-xs font-normal text-muted-foreground">
									{savingSettings ? "Saving…" : automaticEmails ? "On" : "Off"}
								</span>
							</Label>
							<p className="text-sm text-muted-foreground">
								When enabled, the Application sends pending emails automatically
								(may take up to a minute for emails to get marked as Sent).
								Manual sending remains available.
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card className="mt-4 border-border/70">
				<CardHeader className="gap-4">
					<div>
						<CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
							Outbox
						</CardTitle>
						<CardDescription>
							{total} matching · {counts.all} total · {counts.pending} pending ·{" "}
							{counts.sent} sent · {counts.failed} failed
						</CardDescription>
					</div>
					<Tabs
						value={filter}
						onValueChange={(value) => {
							setFilter(value as OutboxFilter);
							setPage(1);
						}}
					>
						<TabsList className="w-full justify-start overflow-x-auto">
							{filters.map((item) => (
								<TabsTrigger key={item.value} value={item.value}>
									{item.label}
									<span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
										{counts[item.value]}
									</span>
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className="space-y-2">
							{["s1", "s2", "s3", "s4", "s5", "s6"].map((key) => (
								<Skeleton key={key} className="h-12 rounded-lg" />
							))}
						</div>
					) : total === 0 ? (
						<EmptyState
							icon={Mail}
							title="No notifications"
							description="Emails appear here when bookings are created or their status changes."
						/>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Template</TableHead>
										<TableHead>Recipient</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Attempts</TableHead>
										<TableHead>Created</TableHead>
										<TableHead>Delivery</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{items.map((item) => (
										<TableRow key={item.id}>
											<TableCell className="max-w-56">
												<p className="truncate text-sm font-medium">
													{emailTemplateLabel[item.template] ?? item.template}
												</p>
												{item.booking_id ? (
													<Link
														to="/admin/bookings"
														search={{ review: item.booking_id }}
														className="block truncate font-mono text-[10px] text-muted-foreground underline-offset-4 hover:underline"
													>
														{String(item.payload?.reference ?? item.booking_id)}
													</Link>
												) : (
													<p className="truncate font-mono text-[10px] text-muted-foreground">
														{String(item.payload?.reference ?? "—")}
													</p>
												)}
											</TableCell>
											<TableCell className="max-w-56">
												<p className="truncate text-sm">
													{item.recipient_name || "—"}
												</p>
												<p className="truncate text-xs text-muted-foreground">
													{item.recipient_email}
												</p>
											</TableCell>
											<TableCell>
												<NotificationStatusBadge status={item.status} />
											</TableCell>
											<TableCell className="text-center text-sm">
												{item.attempts}
											</TableCell>
											<TableCell className="whitespace-nowrap text-xs text-muted-foreground">
												{formatDateTime(item.created_at)}
											</TableCell>
											<TableCell className="max-w-64">
												{item.sent_at ? (
													<p className="text-xs text-emerald-600 dark:text-emerald-400">
														Sent {formatDateTime(item.sent_at)}
													</p>
												) : item.last_error ? (
													<p
														className="truncate text-xs text-destructive"
														title={item.last_error}
													>
														{item.last_error}
													</p>
												) : (
													<p className="text-xs text-muted-foreground">
														Queued {formatDateTime(item.scheduled_for)}
													</p>
												)}
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
							itemLabel="notifications"
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
