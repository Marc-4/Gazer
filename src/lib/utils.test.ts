import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
	it("merges conflicting Tailwind classes", () => {
		expect(cn("px-2", "px-4")).toBe("px-4");
	});

	it("ignores falsey class values", () => {
		expect(cn("text-sm", false && "hidden", undefined, "font-bold")).toBe(
			"text-sm font-bold",
		);
	});
});
