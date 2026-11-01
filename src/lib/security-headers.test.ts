import { describe, expect, it } from "vitest";
import {
	buildContentSecurityPolicy,
	buildSecurityHeaders,
} from "./security-headers";

describe("security headers", () => {
	const production = buildSecurityHeaders({
		supabaseUrl: "https://example.supabase.co",
		isDev: false,
	});

	it("locks down framing, sniffing, and transport", () => {
		expect(production["X-Content-Type-Options"]).toBe("nosniff");
		expect(production["X-Frame-Options"]).toBe("DENY");
		expect(production["Referrer-Policy"]).toBe(
			"strict-origin-when-cross-origin",
		);
		expect(production["Strict-Transport-Security"]).toContain("max-age=");
	});

	it("allows Supabase and Google Fonts without allowing eval", () => {
		const csp = production["Content-Security-Policy"] ?? "";
		expect(csp).toContain(
			"connect-src 'self' https://*.supabase.co wss://*.supabase.co https://example.supabase.co wss://example.supabase.co",
		);
		expect(csp).toContain("https://fonts.googleapis.com");
		expect(csp).toContain("https://fonts.gstatic.com");
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).toContain("object-src 'none'");
		expect(csp).toContain("upgrade-insecure-requests");
		expect(csp).not.toContain("'unsafe-eval'");
	});

	it("relaxes eval and websockets in development", () => {
		const dev = buildContentSecurityPolicy({
			supabaseUrl: "http://127.0.0.1:54321",
			isDev: true,
		});
		expect(dev).toContain("'unsafe-eval'");
		expect(dev).toContain("ws:");
		expect(dev).not.toContain("upgrade-insecure-requests");

		const headers = buildSecurityHeaders({ isDev: true });
		expect(headers["Strict-Transport-Security"]).toBeUndefined();
	});

	it("tolerates a missing Supabase URL", () => {
		const csp = buildContentSecurityPolicy();
		expect(csp).toContain("https://*.supabase.co");
		expect(csp).toContain("default-src 'self'");
	});
});
