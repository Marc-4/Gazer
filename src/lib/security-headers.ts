export interface SecurityHeaderOptions {
	supabaseUrl?: string | null;
	isDev?: boolean;
}

const GOOGLE_FONTS_STYLE = "https://fonts.googleapis.com";
const GOOGLE_FONTS_FILES = "https://fonts.gstatic.com";

function supabaseOrigins(supabaseUrl?: string | null) {
	const origins = new Set<string>([
		"https://*.supabase.co",
		"wss://*.supabase.co",
	]);
	if (!supabaseUrl) return [...origins];

	try {
		const url = new URL(supabaseUrl);
		origins.add(url.origin);
		origins.add(`${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`);
	} catch {
		// Ignore malformed or missing configuration.
	}

	return [...origins];
}

export function buildContentSecurityPolicy({
	supabaseUrl,
	isDev = false,
}: SecurityHeaderOptions = {}) {
	const connect = ["'self'", ...supabaseOrigins(supabaseUrl)];
	const script = ["'self'", "'unsafe-inline'"];

	if (isDev) {
		connect.push("ws:", "http://localhost:*", "http://127.0.0.1:*");
		script.push("'unsafe-eval'");
	}

	const directives: Array<[string, string[]]> = [
		["default-src", ["'self'"]],
		["base-uri", ["'self'"]],
		["object-src", ["'none'"]],
		["frame-ancestors", ["'none'"]],
		["form-action", ["'self'"]],
		["script-src", script],
		["style-src", ["'self'", "'unsafe-inline'", GOOGLE_FONTS_STYLE]],
		["font-src", ["'self'", "data:", GOOGLE_FONTS_FILES]],
		["img-src", ["'self'", "data:", "blob:", "https:"]],
		["media-src", ["'self'"]],
		["connect-src", connect],
		["worker-src", ["'self'", "blob:"]],
		["manifest-src", ["'self'"]],
		["frame-src", ["'none'"]],
	];

	if (!isDev) directives.push(["upgrade-insecure-requests", []]);

	return directives
		.map(([name, values]) =>
			values.length > 0 ? `${name} ${values.join(" ")}` : `${name}`,
		)
		.join("; ");
}

export function buildSecurityHeaders(
	options: SecurityHeaderOptions = {},
): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Security-Policy": buildContentSecurityPolicy(options),
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options": "DENY",
		"Referrer-Policy": "strict-origin-when-cross-origin",
		"Permissions-Policy":
			"camera=(), microphone=(), geolocation=(), payment=(), usb=()",
		"Cross-Origin-Opener-Policy": "same-origin",
		"X-DNS-Prefetch-Control": "off",
	};

	if (!options.isDev) {
		headers["Strict-Transport-Security"] =
			"max-age=63072000; includeSubDomains; preload";
	}

	return headers;
}
