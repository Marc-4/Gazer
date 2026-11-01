import { getAnonServerClient } from "./admin-auth.server";
import { type RateLimitResult, rateLimitMessage } from "./rate-limit";

function clientIp(request: Request) {
	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded) {
		const first = forwarded.split(",")[0]?.trim();
		if (first) return first;
	}

	return (
		request.headers.get("x-real-ip")?.trim() ||
		request.headers.get("cf-connecting-ip")?.trim() ||
		null
	);
}

function requestKey(request: Request) {
	const deviceId = request.headers.get("x-device-id")?.trim();
	if (deviceId) return `device:${deviceId}`;

	const ip = clientIp(request);
	return ip ? `ip:${ip}` : null;
}

export async function consumeRequestRateLimit(
	request: Request,
	scope: string,
	rule: { limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
	const key = requestKey(request);
	if (!key) {
		return { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAfter: 0 };
	}

	const client = getAnonServerClient();
	if (!client) {
		return { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAfter: 0 };
	}

	const { data, error } = await client.rpc("consume_rate_limit", {
		p_scope: scope,
		p_key: key,
		p_limit: rule.limit,
		p_window_seconds: rule.windowSeconds,
	});

	if (error) {
		console.warn(`Rate limit check failed for ${scope}`, error);
		return { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAfter: 0 };
	}

	const result = data as Record<string, unknown> | null;
	if (typeof result?.allowed !== "boolean") {
		return { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAfter: 0 };
	}

	return {
		allowed: result.allowed,
		remaining: typeof result.remaining === "number" ? result.remaining : 0,
		retryAfter: typeof result.retry_after === "number" ? result.retry_after : 0,
	};
}

export function rateLimitResponse(retryAfter: number) {
	return Response.json(
		{ error: rateLimitMessage(retryAfter) },
		{
			status: 429,
			headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfter))) },
		},
	);
}
