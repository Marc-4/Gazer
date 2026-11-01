import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

export type RealtimeTable =
	| "bookings"
	| "notification_outbox"
	| "booking_status_history"
	| "admin_notifications";

type ChangeListener = () => void;
type HubStatus = "connecting" | "subscribed" | "error";

interface RealtimeHub {
	listeners: Set<ChangeListener>;
	channel: ReturnType<typeof supabase.channel> | null;
	status: HubStatus;
	debounceTimer: number | null;
	pollTimer: number | null;
	retryTimer: number | null;
	retryAttempt: number;
	dirty: boolean;
}

const EVENT_DEBOUNCE_MS = 150;
const SUBSCRIBED_POLL_MS = 60_000;
const DISCONNECTED_POLL_MS = 15_000;
const MAX_RETRY_MS = 30_000;

const hubs = new Map<RealtimeTable, RealtimeHub>();
let pageLifecycleBound = false;

function clearTimer(timer: number | null) {
	if (timer !== null) window.clearTimeout(timer);
}

function clearIntervalTimer(timer: number | null) {
	if (timer !== null) window.clearInterval(timer);
}

function flush(hub: RealtimeHub) {
	hub.debounceTimer = null;
	if (
		typeof document !== "undefined" &&
		document.visibilityState === "hidden"
	) {
		// Refetch when the tab becomes visible again instead of doing work in
		// the background.
		hub.dirty = true;
		return;
	}

	hub.dirty = false;
	for (const listener of hub.listeners) listener();
}

function scheduleFlush(hub: RealtimeHub) {
	if (hub.debounceTimer !== null) window.clearTimeout(hub.debounceTimer);
	hub.debounceTimer = window.setTimeout(() => flush(hub), EVENT_DEBOUNCE_MS);
}

function startPolling(hub: RealtimeHub, intervalMs: number) {
	clearIntervalTimer(hub.pollTimer);
	hub.pollTimer = window.setInterval(() => {
		if (
			typeof document !== "undefined" &&
			document.visibilityState === "hidden"
		)
			return;
		for (const listener of hub.listeners) listener();
	}, intervalMs);
}

function stopPolling(hub: RealtimeHub) {
	clearIntervalTimer(hub.pollTimer);
	hub.pollTimer = null;
}

function scheduleReconnect(table: RealtimeTable, hub: RealtimeHub) {
	if (hub.listeners.size === 0 || hub.retryTimer !== null) return;

	const delay = Math.min(
		MAX_RETRY_MS,
		EVENT_DEBOUNCE_MS * 10 * 2 ** Math.min(hub.retryAttempt, 5),
	);
	hub.retryAttempt += 1;
	hub.retryTimer = window.setTimeout(() => {
		hub.retryTimer = null;
		connect(table, hub);
	}, delay);
}

function disconnect(hub: RealtimeHub) {
	if (hub.channel) {
		supabase.removeChannel(hub.channel);
		hub.channel = null;
	}
	clearTimer(hub.retryTimer);
	hub.retryTimer = null;
	stopPolling(hub);
}

function connect(table: RealtimeTable, hub: RealtimeHub) {
	if (hub.listeners.size === 0) return;

	clearTimer(hub.retryTimer);
	hub.retryTimer = null;
	stopPolling(hub);

	if (hub.channel) {
		supabase.removeChannel(hub.channel);
		hub.channel = null;
	}

	hub.status = "connecting";

	const channel = supabase
		.channel(`realtime-${table}`)
		.on("postgres_changes", { event: "*", schema: "public", table }, () => {
			scheduleFlush(hub);
		})
		.subscribe((status) => {
			if (status === "SUBSCRIBED") {
				hub.status = "subscribed";
				hub.retryAttempt = 0;
				startPolling(hub, SUBSCRIBED_POLL_MS);
				// Catch anything that changed while the channel was down.
				if (hub.dirty) scheduleFlush(hub);
				return;
			}

			if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
				hub.status = "error";
				startPolling(hub, DISCONNECTED_POLL_MS);
				// Realtime already retries internally; a slower outer retry
				// recreates the channel when the client gives up.
				scheduleReconnect(table, hub);
				return;
			}

			if (status === "CLOSED") {
				hub.status = "error";
				startPolling(hub, DISCONNECTED_POLL_MS);
				scheduleReconnect(table, hub);
			}
		});

	hub.channel = channel;
}

function bindPageLifecycle() {
	if (pageLifecycleBound || typeof window === "undefined") return;
	pageLifecycleBound = true;

	const onVisible = () => {
		if (document.visibilityState !== "visible") return;
		for (const [table, hub] of hubs) {
			if (hub.dirty) scheduleFlush(hub);
			if (hub.status !== "subscribed") connect(table, hub);
		}
	};

	const onOnline = () => {
		for (const [table, hub] of hubs) {
			if (hub.status !== "subscribed") connect(table, hub);
		}
	};

	document.addEventListener("visibilitychange", onVisible);
	window.addEventListener("online", onOnline);
}

function subscribe(table: RealtimeTable, listener: ChangeListener) {
	bindPageLifecycle();

	let hub = hubs.get(table);
	if (!hub) {
		hub = {
			listeners: new Set(),
			channel: null,
			status: "connecting",
			debounceTimer: null,
			pollTimer: null,
			retryTimer: null,
			retryAttempt: 0,
			dirty: false,
		};
		hubs.set(table, hub);
	}

	hub.listeners.add(listener);
	if (!hub.channel) connect(table, hub);
	return hub;
}

function unsubscribe(table: RealtimeTable, listener: ChangeListener) {
	const hub = hubs.get(table);
	if (!hub) return;

	hub.listeners.delete(listener);
	if (hub.listeners.size > 0) return;

	clearTimer(hub.debounceTimer);
	disconnect(hub);
	hubs.delete(table);
}

function useRealtimeTable(
	table: RealtimeTable,
	onChange: () => void,
	enabled = true,
) {
	const listenerRef = useRef(onChange);

	useEffect(() => {
		listenerRef.current = onChange;
	}, [onChange]);

	useEffect(() => {
		if (!enabled) return;

		const listener = () => listenerRef.current();
		subscribe(table, listener);

		return () => unsubscribe(table, listener);
	}, [enabled, table]);
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
