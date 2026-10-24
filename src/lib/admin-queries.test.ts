import { describe, expect, it, vi } from "vitest";
import { buildSearchFilter } from "./admin-queries";

vi.mock("./supabase", () => ({ supabase: {} }));

describe("buildSearchFilter", () => {
	it("builds an ilike clause for every searchable column", () => {
		expect(buildSearchFilter(["name", "description"], "  science fair ")).toBe(
			"name.ilike.%science fair%,description.ilike.%science fair%",
		);
	});

	it("returns null when the search term is empty", () => {
		expect(buildSearchFilter(["name"], "   ")).toBeNull();
		expect(buildSearchFilter(["name"], ' ,()"%_* ')).toBeNull();
	});

	it("strips characters that would break PostgREST or act as wildcards", () => {
		expect(buildSearchFilter(["name"], 'a,b(c)%_*"')).toBe(
			"name.ilike.%a b c%",
		);
	});
});
