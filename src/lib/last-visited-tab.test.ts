import { beforeEach, describe, expect, it } from "vitest";
import {
	getLastVisitedTab,
	getPostAuthPath,
	setLastVisitedTab,
} from "./last-visited-tab";

describe("last visited tab", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it("stores and reads app tab paths", () => {
		setLastVisitedTab("/admin/notifications");

		expect(getLastVisitedTab()).toBe("/admin/notifications");
	});

	it("ignores paths outside the authenticated app", () => {
		setLastVisitedTab("/book");

		expect(getLastVisitedTab()).toBeNull();
	});

	it("uses the stored tab for the matching role", () => {
		setLastVisitedTab("/admin/bookings");

		expect(getPostAuthPath({ isAdmin: true })).toBe("/admin/bookings");
	});

	it("does not send bookers to stored admin tabs", () => {
		setLastVisitedTab("/admin/bookings");

		expect(getPostAuthPath({ isAdmin: false })).toBe("/dashboard");
	});

	it("prefers an explicit redirect over the stored tab", () => {
		setLastVisitedTab("/admin/notifications");

		expect(getPostAuthPath({ redirect: "/admin/venues", isAdmin: true })).toBe(
			"/admin/venues",
		);
	});

	it("defaults to the dashboard without a stored tab", () => {
		expect(getPostAuthPath({ isAdmin: false })).toBe("/dashboard");
	});
});
