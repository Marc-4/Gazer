import type { AvailabilityEntry } from "./types";

export type AvailabilityTone = "free" | "pending" | "approved" | "school";

export function availabilityTone(
	entries: AvailabilityEntry[],
): AvailabilityTone {
	if (entries.some((entry) => entry.kind === "school_event")) return "school";
	if (entries.some((entry) => entry.status === "approved")) return "approved";
	if (entries.some((entry) => entry.status === "pending")) return "pending";
	return "free";
}

function normalizedTime(value: string | null | undefined) {
	return value ? value.slice(0, 5) : null;
}

export function availabilityConflicts(
	entry: AvailabilityEntry,
	startTime?: string | null,
	endTime?: string | null,
) {
	if (entry.kind === "school_event") return true;
	if (entry.kind === "booking" && entry.status !== "approved") return false;

	const entryStart = normalizedTime(entry.start_time);
	const entryEnd = normalizedTime(entry.end_time);
	const start = normalizedTime(startTime);
	const end = normalizedTime(endTime);

	if (!entryStart || !entryEnd || !start || !end) return true;

	return start < entryEnd && entryStart < end;
}

export function isAvailabilityBlocked(
	entries: AvailabilityEntry[],
	startTime?: string | null,
	endTime?: string | null,
) {
	return entries.some((entry) =>
		availabilityConflicts(entry, startTime, endTime),
	);
}

export function groupAvailabilityByDate(entries: AvailabilityEntry[]) {
	const map = new Map<string, AvailabilityEntry[]>();

	for (const entry of entries) {
		const existing = map.get(entry.booking_date) ?? [];
		existing.push(entry);
		map.set(entry.booking_date, existing);
	}

	return map;
}

export function filterAvailabilityForVenue(
	entries: AvailabilityEntry[],
	venueId: string | null | undefined,
) {
	if (!venueId) return entries;
	return entries.filter((entry) => entry.venue_id === venueId);
}

/**
 * Client-side capacity guard. Returns a readable error when the attendee count
 * exceeds the selected venue's capacity; venues without a capacity are
 * unlimited. The server does not enforce this, so keep the rule here so the
 * public form and the admin form stay in sync.
 */
export function capacityError(
	attendeeCount: string | number | null | undefined,
	capacity: number | null | undefined,
) {
	if (capacity == null || capacity <= 0) return null;

	const count =
		typeof attendeeCount === "string"
			? Number(attendeeCount.trim())
			: attendeeCount;
	if (count == null || !Number.isFinite(count) || count <= 0) return null;
	if (count <= capacity) return null;

	return `This venue seats ${capacity} ${capacity === 1 ? "person" : "people"}. Reduce attendees to ${capacity} or fewer, or choose another venue.`;
}
