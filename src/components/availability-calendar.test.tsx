import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { todayIsoDate } from "#/lib/format";
import type { AvailabilityEntry } from "#/lib/types";
import { AvailabilityCalendar } from "./availability-calendar";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("#/lib/supabase", () => ({
	supabase: { rpc },
}));

const booking: AvailabilityEntry = {
	venue_id: "venue-1",
	venue_name: "Main hall",
	booking_date: todayIsoDate(),
	start_time: "09:00",
	end_time: "10:00",
	kind: "booking",
	status: "approved",
	label: null,
};

const schoolEvent: AvailabilityEntry = {
	venue_id: "venue-1",
	venue_name: "Main hall",
	booking_date: todayIsoDate(),
	start_time: null,
	end_time: null,
	kind: "school_event",
	status: "blocked",
	label: "Foundation Day",
};

describe("AvailabilityCalendar", () => {
	beforeEach(() => {
		rpc.mockReset();
	});

	it("shows an available selected date", async () => {
		rpc.mockResolvedValue({ data: [], error: null });

		render(
			<AvailabilityCalendar
				selectedDate={todayIsoDate()}
				onSelectDate={() => undefined}
			/>,
		);

		expect(await screen.findByText("Availability")).toBeInTheDocument();
		expect(
			await screen.findByText("Available for a new booking."),
		).toBeInTheDocument();
	});

	it("shows a non-overlapping selected time as available", async () => {
		rpc.mockResolvedValue({ data: [booking], error: null });

		render(
			<AvailabilityCalendar
				selectedDate={todayIsoDate()}
				selectedStartTime="10:00"
				selectedEndTime="11:00"
				onSelectDate={() => undefined}
			/>,
		);

		expect(
			await screen.findByText("Available for the selected time."),
		).toBeInTheDocument();
	});

	it("shows an overlapping selected time as unavailable", async () => {
		rpc.mockResolvedValue({ data: [booking], error: null });

		render(
			<AvailabilityCalendar
				selectedDate={todayIsoDate()}
				selectedStartTime="09:30"
				selectedEndTime="10:30"
				onSelectDate={() => undefined}
			/>,
		);

		expect(
			await screen.findByText("Already held during the selected time."),
		).toBeInTheDocument();
	});

	it("shows a school event as unavailable", async () => {
		rpc.mockResolvedValue({ data: [schoolEvent], error: null });

		render(
			<AvailabilityCalendar
				selectedDate={todayIsoDate()}
				onSelectDate={() => undefined}
			/>,
		);

		expect(
			await screen.findByText("Reserved for a school event."),
		).toBeInTheDocument();
		expect(screen.getAllByText("Foundation Day").length).toBeGreaterThan(0);
	});
});
