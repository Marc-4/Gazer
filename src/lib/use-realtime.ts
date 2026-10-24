import { useEffect, useId, useRef } from "react";
import { supabase } from "./supabase";

export type RealtimeTable =
	| "bookings"
	| "notification_outbox"
	| "booking_status_history"
	| "admin_notifications";

function useRealtimeTable(
	table: RealtimeTable,
	onChange: () => void,
	enabled = true,
) {
	const onChangeRef = useRef(onChange);
	const channelId = useId().replace(/[^a-zA-Z0-9_-]/g, "");

	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	useEffect(() => {
		if (!enabled) return;

		let timeout: number | null = null;
		const channel = supabase
			.channel(`realtime-${table}-${channelId}`)
			.on("postgres_changes", { event: "*", schema: "public", table }, () => {
				if (timeout !== null) window.clearTimeout(timeout);
				timeout = window.setTimeout(() => onChangeRef.current(), 120);
			})
			.subscribe((status) => {
				if (status === "CHANNEL_ERROR") {
					console.error(`Realtime subscription failed for ${table}`);
				}
			});

		return () => {
			if (timeout !== null) window.clearTimeout(timeout);
			supabase.removeChannel(channel);
		};
	}, [channelId, enabled, table]);
}

export function useBookingsRealtime(onChange: () => void, enabled = true) {
	useRealtimeTable("bookings", onChange, enabled);
}

export function useNotificationOutboxRealtime(
	onChange: () => void,
	enabled = true,
) {
	useRealtimeTable("notification_outbox", onChange, enabled);
}

export function useBookingStatusHistoryRealtime(
	onChange: () => void,
	enabled = true,
) {
	useRealtimeTable("booking_status_history", onChange, enabled);
}

export function useAdminNotificationsRealtime(
	onChange: () => void,
	enabled = true,
) {
	useRealtimeTable("admin_notifications", onChange, enabled);
}
