import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { EMAIL_CONFIG_ERROR, isEmailConfigured } from "#/lib/email";
import { dispatchNotificationOutbox } from "#/lib/outbox.server";

async function hasAdminSession(token: string) {
	const url =
		process.env.SUPABASE_URL ??
		process.env.VITE_SUPABASE_URL ??
		import.meta.env.VITE_SUPABASE_URL;
	const key =
		process.env.SUPABASE_ANON_KEY ??
		process.env.VITE_SUPABASE_KEY ??
		import.meta.env.VITE_SUPABASE_KEY;

	if (!url || !key) return false;

	const client = createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { headers: { Authorization: `Bearer ${token}` } },
	});

	const {
		data: { user },
		error,
	} = await client.auth.getUser(token);

	if (error || !user) return false;

	const { data: profile } = await client
		.from("profiles")
		.select("role, is_active")
		.eq("id", user.id)
		.maybeSingle();

	return profile?.role === "admin" && profile.is_active === true;
}

async function isAuthorized(request: Request) {
	const secret = process.env.NOTIFICATION_WORKER_SECRET;
	const providedSecret = request.headers.get("x-worker-secret");
	if (secret && providedSecret === secret) {
		return { ok: true, via: "worker-secret" as const };
	}

	const authorization = request.headers.get("authorization");
	if (!authorization?.startsWith("Bearer ")) {
		return { ok: false, via: null };
	}

	const token = authorization.slice("Bearer ".length).trim();
	if (!token) return { ok: false, via: null };

	return { ok: await hasAdminSession(token), via: "admin" as const };
}

export const Route = createFileRoute("/api/notifications/dispatch")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const auth = await isAuthorized(request);
				if (!auth.ok) {
					return Response.json(
						{ error: "Unauthorized. Admin session or worker secret required." },
						{ status: 401 },
					);
				}

				if (!isEmailConfigured()) {
					return Response.json({ error: EMAIL_CONFIG_ERROR }, { status: 503 });
				}

				const url = new URL(request.url);
				const retryFailed = url.searchParams.get("retry") === "1";
				const requestedLimit = Number(url.searchParams.get("limit") ?? "25");

				try {
					const result = await dispatchNotificationOutbox({
						retryFailed,
						limit: Number.isFinite(requestedLimit) ? requestedLimit : 25,
					});

					return Response.json({ ok: true, ...result });
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Unknown dispatch error";
					return Response.json({ error: message }, { status: 500 });
				}
			},
		},
	},
});
