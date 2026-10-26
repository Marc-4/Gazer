import { createFileRoute } from "@tanstack/react-router";
import { authorizeNotificationRequest } from "#/lib/notification-auth.server";
import {
	cancelNotificationOutboxItem,
	requeueNotificationOutboxItem,
} from "#/lib/outbox.server";

type OutboxAction = "cancel" | "requeue";

function isOutboxAction(value: unknown): value is OutboxAction {
	return value === "cancel" || value === "requeue";
}

export const Route = createFileRoute("/api/notifications/outbox")({
	server: {
		handlers: {
			PATCH: async ({ request }) => {
				const auth = await authorizeNotificationRequest(request);
				if (!auth.ok) {
					return Response.json(
						{ error: "Unauthorized. Admin session or worker secret required." },
						{ status: 401 },
					);
				}

				const body = (await request.json().catch(() => null)) as {
					id?: unknown;
					action?: unknown;
				} | null;
				const id = typeof body?.id === "string" ? body.id.trim() : "";
				const action = body?.action;

				if (!id || !isOutboxAction(action)) {
					return Response.json(
						{ error: "A notification id and valid action are required." },
						{ status: 400 },
					);
				}

				try {
					const changed =
						action === "cancel"
							? await cancelNotificationOutboxItem(id)
							: await requeueNotificationOutboxItem(id);

					if (!changed) {
						return Response.json(
							{
								error:
									action === "cancel"
										? "Only pending notifications can be cancelled."
										: "Only cancelled notifications can be queued again.",
							},
							{ status: 404 },
						);
					}

					return Response.json({
						ok: true,
						status: action === "cancel" ? "cancelled" : "pending",
					});
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Unable to update notification.";
					return Response.json({ error: message }, { status: 500 });
				}
			},
		},
	},
});
