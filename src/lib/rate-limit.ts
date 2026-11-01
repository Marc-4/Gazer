import { getDeviceId } from "./device-id";
import { supabase } from "./supabase";

export interface RateLimitRule {
	limit: number;
	windowSeconds: number;
}

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	retryAfter: number;
}

export const RATE_LIMITS = {
	bookingCreate: { limit: 5, windowSeconds: 10 * 60 },
	accountInvite: { limit: 5, windowSeconds: 60 * 60 },
	bookingLookup: { limit: 60, windowSeconds: 10 * 60 },
	bookingCancel: { limit: 10, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitRule>;

const ALLOWED: RateLimitResult = {
	allowed: true,
	remaining: Number.MAX_SAFE_INTEGER,
	retryAfter: 0,
};

function parseResult(value: unknown): RateLimitResult | null {
	if (!value || typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	if (typeof record.allowed !== "boolean") return null;

	return {
		allowed: record.allowed,
		remaining: typeof record.remaining === "number" ? record.remaining : 0,
		retryAfter: typeof record.retry_after === "number" ? record.retry_after : 0,
	};
}

/**
 * Consumes a rate-limit slot for this device. Failures are allowed through:
 * rate limiting is abuse protection, not an authorization check, and a
 * database hiccup should not block legitimate bookings.
 */
export async function checkRateLimit(
	scope: string,
	rule: RateLimitRule,
): Promise<RateLimitResult> {
	const deviceId = await getDeviceId();
	if (!deviceId) return ALLOWED;

	const { data, error } = await supabase.rpc("consume_rate_limit", {
		p_scope: scope,
		p_key: `device:${deviceId}`,
		p_limit: rule.limit,
		p_window_seconds: rule.windowSeconds,
	});

	if (error) {
		console.warn(`Rate limit check failed for ${scope}`, error);
		return ALLOWED;
	}

	return parseResult(data) ?? ALLOWED;
}

export function rateLimitMessage(retryAfter: number) {
	const seconds = Math.max(1, Math.ceil(retryAfter));
	if (seconds < 60) {
		return `Too many requests. Please try again in ${seconds} second${seconds === 1 ? "" : "s"}.`;
	}

	const minutes = Math.ceil(seconds / 60);
	return `Too many requests. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
