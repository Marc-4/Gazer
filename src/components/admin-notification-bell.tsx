import { useNavigate } from "@tanstack/react-router";
import { Bell, BellOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import { formatRelativeToNow } from "#/lib/format";
import { supabase } from "#/lib/supabase";
import type { AdminNotification } from "#/lib/types";
import { cn } from "#/lib/utils";

const POLL_INTERVAL_MS = 30_000;

export function AdminNotificationBell({ className }: { className?: string }) {
	const [open, setOpen] = useState(false);
	const [items, setItems] = useState<AdminNotification[]>([]);
	const [unreadCount, setUnreadCount] = useState(0);
	const [loading, setLoading] = useState(false);
	const navigate = useNavigate();

	const loadCount = useCallback(async () => {
		const { count, error } = await supabase
			.from("admin_notifications")
			.select("*", { count: "exact", head: true })
			.eq("status", "unseen");

		if (error) {
			console.error("Unable to load admin notifications", error);
			return;
		}

		setUnreadCount(count ?? 0);
	}, []);

	useEffect(() => {
		loadCount();

		const interval = window.setInterval(() => {
			if (!open) loadCount();
		}, POLL_INTERVAL_MS);

		return () => window.clearInterval(interval);
	}, [loadCount, open]);

	const handleOpenChange = async (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) return;

		setLoading(true);
		setItems([]);
		const { data, error } = await supabase
			.from("admin_notifications")
			.select("*")
			.order("created_at", { ascending: false })
			.limit(10);

		setLoading(false);

		if (error) {
			toast.error(error.message);
			return;
		}

		setItems((data as AdminNotification[] | null) ?? []);
		setUnreadCount(0);

		const { error: seenError } = await supabase.rpc(
			"mark_admin_notifications_seen",
		);
		if (seenError) toast.error(seenError.message);
	};

	const openBooking = (bookingId: string) => {
		setOpen(false);
		navigate({ to: "/admin/bookings", search: { review: bookingId } });
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={
						unreadCount > 0
							? `Notifications, ${unreadCount} unread`
							: "Notifications"
					}
					className={cn(
						"relative grid size-8 shrink-0 place-items-center rounded-lg text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#f0c75e] focus-visible:outline-none",
						className,
					)}
				>
					<Bell className="size-4" />
					{unreadCount > 0 ? (
						<span className="absolute top-1 right-1 size-2 rounded-full bg-red-500 ring-2 ring-[#0b1f3a]" />
					) : null}
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
			>
				<div className="border-b px-4 py-3">
					<p className="text-sm font-semibold">Notifications</p>
					<p className="text-xs text-muted-foreground">
						{loading
							? "Checking for notifications…"
							: items.length > 0
								? `${items.length} notification${items.length === 1 ? "" : "s"}`
								: "You're all caught up."}
					</p>
				</div>
				<div className="max-h-80 overflow-y-auto overscroll-contain">
					{loading ? (
						<div className="space-y-3 p-4">
							<div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
							<div className="h-3 w-full animate-pulse rounded bg-muted" />
						</div>
					) : items.length === 0 ? (
						<div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
							<BellOff className="size-6 text-muted-foreground/60" />
							<p className="text-sm font-medium">No notifications</p>
							<p className="text-xs text-muted-foreground">
								New booking requests will appear here.
							</p>
						</div>
					) : (
						<div className="divide-y">
							{items.map((item) => (
								<button
									key={item.id}
									type="button"
									onClick={() => openBooking(item.booking_id)}
									className={cn(
										"block w-full px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
										item.status === "unseen" && "border-l-2 border-red-500",
									)}
								>
									<p className="text-sm font-semibold">{item.title}</p>
									<p className="mt-1 text-xs leading-5 text-muted-foreground">
										{item.message}
									</p>
									<p className="mt-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
										{formatRelativeToNow(item.created_at)}
									</p>
								</button>
							))}
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
