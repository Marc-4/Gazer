import { and, eq, lte } from "drizzle-orm";
import { createDatabase } from "./db";
import { notificationOutbox, notificationSettings } from "./db/schema";
import {
	type EmailPayload,
	isEmailConfigured,
	renderEmail,
	sendEmail,
} from "./email";
import type { EmailTemplate } from "./types";

const MAX_ATTEMPTS = 5;

export interface DispatchResult {
	processed: number;
	sent: number;
	failed: number;
	skipped: number;
}

export async function dispatchNotificationOutbox(options?: {
	limit?: number;
	retryFailed?: boolean;
	onlyWhenAutomaticEnabled?: boolean;
}): Promise<DispatchResult> {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set");
	}

	const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100);
	const { client, db } = createDatabase(databaseUrl);
	const emptyResult: DispatchResult = {
		processed: 0,
		sent: 0,
		failed: 0,
		skipped: 0,
	};

	try {
		if (!isEmailConfigured()) {
			return emptyResult;
		}

		return await db.transaction(async (tx) => {
			if (options?.onlyWhenAutomaticEnabled) {
				const [settings] = await tx
					.select({
						automaticEmailsEnabled: notificationSettings.automaticEmailsEnabled,
					})
					.from(notificationSettings)
					.limit(1);

				if (!settings?.automaticEmailsEnabled) {
					return emptyResult;
				}
			}

			if (options?.retryFailed) {
				await tx
					.update(notificationOutbox)
					.set({
						status: "pending",
						lastError: null,
						scheduledFor: new Date(),
					})
					.where(eq(notificationOutbox.status, "failed"));
			}

			const pending = await tx
				.select()
				.from(notificationOutbox)
				.where(
					and(
						eq(notificationOutbox.status, "pending"),
						lte(notificationOutbox.scheduledFor, new Date()),
					),
				)
				.orderBy(notificationOutbox.scheduledFor)
				.limit(limit)
				.for("update", { skipLocked: true });

			const result: DispatchResult = {
				processed: pending.length,
				sent: 0,
				failed: 0,
				skipped: 0,
			};

			for (const item of pending) {
				const attempts = item.attempts + 1;
				try {
					const rendered = renderEmail(
						item.template as EmailTemplate,
						(item.payload ?? {}) as EmailPayload,
					);
					await sendEmail({
						to: { email: item.recipientEmail, name: item.recipientName },
						subject: rendered.subject,
						html: rendered.html,
						text: rendered.text,
					});

					await tx
						.update(notificationOutbox)
						.set({
							status: "sent",
							attempts,
							sentAt: new Date(),
							lastError: null,
						})
						.where(eq(notificationOutbox.id, item.id));

					result.sent += 1;
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Unknown delivery error";
					const exhausted = attempts >= MAX_ATTEMPTS;

					await tx
						.update(notificationOutbox)
						.set({
							status: exhausted ? "failed" : "pending",
							attempts,
							lastError: message.slice(0, 1000),
							scheduledFor: exhausted
								? item.scheduledFor
								: new Date(Date.now() + attempts * 60_000),
						})
						.where(eq(notificationOutbox.id, item.id));

					if (exhausted) {
						result.failed += 1;
					} else {
						result.skipped += 1;
					}
				}
			}

			return result;
		});
	} finally {
		await client.end({ timeout: 5 });
	}
}
