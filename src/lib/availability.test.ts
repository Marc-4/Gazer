import { describe, expect, it } from "vitest";
import {
	availabilityConflicts,
	availabilityTone,
	filterAvailabilityForVenue,
	groupAvailabilityByDate,
	isAvailabilityBlocked,
} from "./availability";
import type { AvailabilityEntry } from "./types";

const booking: AvailabilityEntry = {
	venue_id: "venue-1",
	venue_name: "Main hall",
	booking_date: "2026-10-24",
	start_time: "09:00",
	end_time: "10:00",
	kind: "booking",
	status: "pending",
	label: null,
};

const approvedBooking: AvailabilityEntry = {
	...booking,
	status: "approved",
};

const schoolEvent: AvailabilityEntry = {
	...booking,
	kind: "school_event",
	status: "blocked",
	label: "Foundation Day",
};

describe("availability helpers", () => {
	it("prioritizes school events over bookings", () => {
		expect(availabilityTone([booking, schoolEvent])).toBe("school");
	});

	it("reports approved bookings before pending bookings", () => {
		expect(availabilityTone([booking, approvedBooking])).toBe("approved");
	});

	it("does not mark pending bookings as blocked", () => {
		expect(isAvailabilityBlocked([booking])).toBe(false);
		expect(isAvailabilityBlocked([booking], "09:30", "10:30")).toBe(false);
		expect(isAvailabilityBlocked([booking], null, null)).toBe(false);
	});

	it("allows non-overlapping times", () => {
		expect(isAvailabilityBlocked([approvedBooking], "10:00", "11:00")).toBe(
			false,
		);
		expect(isAvailabilityBlocked([approvedBooking], "08:00", "09:00")).toBe(
			false,
		);
	});

	it("blocks overlapping times for approved bookings", () => {
		expect(isAvailabilityBlocked([approvedBooking], "09:30", "10:30")).toBe(
			true,
		);
		expect(isAvailabilityBlocked([approvedBooking], "08:30", "09:30")).toBe(
			true,
		);
	});

	it("treats an all-day approved entry as blocking every time", () => {
		const allDay = {
			...approvedBooking,
			start_time: null,
			end_time: null,
		};
		expect(isAvailabilityBlocked([allDay], "10:00", "11:00")).toBe(true);
	});

	it("treats a time-less approved booking as blocking the whole date", () => {
		expect(isAvailabilityBlocked([approvedBooking], null, null)).toBe(true);
	});

	it("normalizes seconds in database times", () => {
		const withSeconds = {
			...approvedBooking,
			start_time: "09:00:00",
			end_time: "10:00:00",
		};
		expect(isAvailabilityBlocked([withSeconds], "10:00", "11:00")).toBe(false);
		expect(availabilityConflicts(withSeconds, "09:30", "10:30")).toBe(true);
	});

	it("keeps school events blocking for the whole date", () => {
		expect(isAvailabilityBlocked([schoolEvent], "10:00", "11:00")).toBe(true);
	});

	it("blocks a pending request when an approved booking overlaps it", () => {
		expect(
			isAvailabilityBlocked([booking, approvedBooking], "09:30", "10:30"),
		).toBe(true);
	});

	it("leaves empty dates available", () => {
		expect(availabilityTone([])).toBe("free");
		expect(isAvailabilityBlocked([])).toBe(false);
	});

	it("groups entries by booking date", () => {
		const grouped = groupAvailabilityByDate([
			booking,
			{ ...booking, venue_id: "venue-2", venue_name: "Room 2" },
		]);

		expect(grouped.get("2026-10-24")).toHaveLength(2);
	});

	it("filters entries to the selected venue", () => {
		expect(
			filterAvailabilityForVenue(
				[booking, { ...booking, venue_id: "venue-2" }],
				"venue-1",
			),
		).toEqual([booking]);
	});
});
