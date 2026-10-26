import { createFileRoute } from "@tanstack/react-router";
import { EMAIL_CONFIG_ERROR, isEmailConfigured } from "#/lib/email";
import { authorizeNotificationRequest } from "#/lib/notification-auth.server";
import { dispatchNotificationOutbox } from "#/lib/outbox.server";

export const Route = createFileRoute("/api/notifications/dispatch")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const auth = await authorizeNotificationRequest(request);
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
				const id = url.searchParams.get("id")?.trim() || undefined;
				const requestedLimit = Number(url.searchParams.get("limit") ?? "25");

				try {
					const result = await dispatchNotificationOutbox({
						retryFailed,
						id,
						limit: Number.isFinite(requestedLimit) ? requestedLimit : 25,
					});

					if (id && result.processed === 0) {
						return Response.json(
							{ error: "Pending notification not found." },
							{ status: 404 },
						);
					}

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
