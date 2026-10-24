import { describe, expect, it } from "vitest";
import { parseBookingLookup } from "./booking-lookup";

const token = "20113305-9c3c-41ca-8922-d17151cecac7";

describe("parseBookingLookup", () => {
	it("extracts a token from a private link", () => {
		expect(parseBookingLookup(`http://localhost:3000/bookings/${token}`)).toBe(
			token,
		);
	});

	it("accepts a pasted token", () => {
		expect(parseBookingLookup(` ${token.toUpperCase()} `)).toBe(token);
	});

	it("extracts a reference from a private link", () => {
		expect(
			parseBookingLookup("http://localhost:3000/bookings/BK-48757CB21857"),
		).toBe("BK-48757CB21857");
	});

	it("normalizes a pasted reference", () => {
		expect(parseBookingLookup(" bk-48757cb21857 ")).toBe("BK-48757CB21857");
	});

	it("rejects invalid values", () => {
		expect(parseBookingLookup("not-a-booking")).toBeNull();
		expect(parseBookingLookup("BK-123")).toBeNull();
	});
});
