import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookingStatusBadge, NotificationStatusBadge } from "./status-badge";

describe("status badges", () => {
	it("renders a booking status label", () => {
		render(<BookingStatusBadge status="approved" />);

		expect(screen.getByText("Approved")).toBeInTheDocument();
	});

	it("renders a notification status label", () => {
		render(<NotificationStatusBadge status="failed" />);

		expect(screen.getByText("Failed")).toBeInTheDocument();
	});
});
