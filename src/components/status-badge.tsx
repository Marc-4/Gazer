import { Badge } from "#/components/ui/badge";
import type { BookingStatus, NotificationStatus } from "#/lib/types";
import { cn } from "#/lib/utils";

const bookingStyles: Record<BookingStatus, string> = {
	pending:
		"border-amber-300/60 bg-amber-100 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-200",
	approved:
		"border-emerald-300/60 bg-emerald-100 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-200",
	rejected:
		"border-rose-300/60 bg-rose-100 text-rose-900 dark:border-rose-400/30 dark:bg-rose-400/15 dark:text-rose-200",
	cancelled:
		"border-slate-300/60 bg-slate-100 text-slate-700 dark:border-slate-400/30 dark:bg-slate-400/15 dark:text-slate-200",
};

const notificationStyles: Record<NotificationStatus, string> = {
	pending:
		"border-amber-300/60 bg-amber-100 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-200",
	sent: "border-emerald-300/60 bg-emerald-100 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-200",
	failed:
		"border-rose-300/60 bg-rose-100 text-rose-900 dark:border-rose-400/30 dark:bg-rose-400/15 dark:text-rose-200",
};

const labels: Record<string, string> = {
	pending: "Pending",
	approved: "Approved",
	rejected: "Rejected",
	cancelled: "Cancelled",
	sent: "Sent",
	failed: "Failed",
};

export function BookingStatusBadge({
	status,
	className,
}: {
	status: BookingStatus;
	className?: string;
}) {
	return (
		<Badge
			variant="outline"
			className={cn("font-semibold", bookingStyles[status], className)}
		>
			{labels[status] ?? status}
		</Badge>
	);
}

export function NotificationStatusBadge({
	status,
	className,
}: {
	status: NotificationStatus;
	className?: string;
}) {
	return (
		<Badge
			variant="outline"
			className={cn("font-semibold", notificationStyles[status], className)}
		>
			{labels[status] ?? status}
		</Badge>
	);
}
