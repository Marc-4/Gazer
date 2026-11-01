import { and, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
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
const BATCH_SIZE = 10;
const TIME_BUDGET_MS = 40_000; // stop starting new batches before the serverless timeout
// A claim is abandoned if the worker crashes or the function times out mid-send.
const CLAIM_LEASE_MS = 5 * 60_000;

export interface DispatchResult {
	processed: number;
	sent: number;
	failed: number;
	skipped: number;
}

interface ClaimedItem {
	id: string;
	template: EmailTemplate;
	recipientEmail: string;
	recipientName: string | null;
	payload: Record<string, unknown> | null;
	attempts: number;
	scheduledFor: Date;
}

export async function dispatchNotificationOutbox(options?: {
	limit?: number;
	retryFailed?: boolean;
	onlyWhenAutomaticEnabled?: boolean;
	id?: string;
}): Promise<DispatchResult> {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is not set");

	const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100);
	const { client, db } = createDatabase(databaseUrl);
	const total: DispatchResult = {
		processed: 0,
		sent: 0,
		failed: 0,
		skipped: 0,
	};

	try {
		if (!isEmailConfigured()) return total;

		const deadline = Date.now() + TIME_BUDGET_MS;
		let remaining = options?.id ? 1 : limit;
		let firstBatch = true;

		while (remaining > 0 && Date.now() < deadline) {
			const batchLimit = Math.min(BATCH_SIZE, remaining);
			const isFirst = firstBatch;
			firstBatch = false;
			const now = new Date();
			const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS);

			// Claim work in a short transaction. The SMTP calls happen after commit,
			// so a slow mail server never holds row locks or a database transaction.
			const claimed = await db.transaction(
				async (tx): Promise<ClaimedItem[] | null> => {
					// Checked every batch, so flipping the toggle off stops the run
					// after at most 10 more emails.
					if (options?.onlyWhenAutomaticEnabled) {
						const [settings] = await tx
							.select({ enabled: notificationSettings.automaticEmailsEnabled })
							.from(notificationSettings)
							.limit(1);
						if (!settings?.enabled) return null;
					}

					// Only reset failed rows once, not on every batch
					if (options?.retryFailed && isFirst) {
						await tx
							.update(notificationOutbox)
							.set({
								attempts: 0,
								status: "pending",
								lastError: null,
								claimedAt: null,
								scheduledFor: now,
							})
							.where(eq(notificationOutbox.status, "failed"));
					}

					const due = await tx
						.select({ id: notificationOutbox.id })
						.from(notificationOutbox)
						.where(
							and(
								eq(notificationOutbox.status, "pending"),
								lte(notificationOutbox.scheduledFor, now),
								or(
									isNull(notificationOutbox.claimedAt),
									lt(notificationOutbox.claimedAt, staleBefore),
								),
								options?.id ? eq(notificationOutbox.id, options.id) : undefined,
							),
						)
						.orderBy(notificationOutbox.scheduledFor)
						.limit(batchLimit)
						.for("update", { skipLocked: true });

					if (due.length === 0) return [];

					const ids = due.map((item) => item.id);
					const rows = await tx
						.update(notificationOutbox)
						.set({
							claimedAt: now,
							attempts: sql`${notificationOutbox.attempts} + 1`,
						})
						.where(inArray(notificationOutbox.id, ids))
						.returning();

					return rows.map((item) => ({
						id: item.id,
						template: item.template as EmailTemplate,
						recipientEmail: item.recipientEmail,
						recipientName: item.recipientName,
						payload: item.payload ?? null,
						attempts: item.attempts,
						scheduledFor: item.scheduledFor,
					}));
				},
			);

			// Toggle off, or nothing left to claim
			if (!claimed || claimed.length === 0) break;

			const result: DispatchResult = {
				processed: claimed.length,
				sent: 0,
				failed: 0,
				skipped: 0,
			};

			// Send outside the transaction. A crash here leaves the row claimed;
			// the lease lets a later run pick it up again.
			for (const item of claimed) {
				try {
					const rendered = renderEmail(
						item.template,
						(item.payload ?? {}) as EmailPayload,
					);
					await sendEmail({
						to: { email: item.recipientEmail, name: item.recipientName },
						subject: rendered.subject,
						html: rendered.html,
						text: rendered.text,
					});

					await db
						.update(notificationOutbox)
						.set({
							status: "sent",
							sentAt: new Date(),
							lastError: null,
							claimedAt: null,
						})
						.where(eq(notificationOutbox.id, item.id));

					result.sent += 1;
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Unknown delivery error";
					const exhausted = item.attempts >= MAX_ATTEMPTS;

					await db
						.update(notificationOutbox)
						.set({
							status: exhausted ? "failed" : "pending",
							lastError: message.slice(0, 1000),
							claimedAt: null,
							scheduledFor: exhausted
								? item.scheduledFor
								: new Date(Date.now() + item.attempts * 60_000),
						})
						.where(
							and(
								eq(notificationOutbox.id, item.id),
								// A cancellation that landed while the email was in flight wins.
								eq(notificationOutbox.status, "pending"),
							),
						);

					if (exhausted) result.failed += 1;
					else result.skipped += 1;
				}
			}

			total.processed += result.processed;
			total.sent += result.sent;
			total.failed += result.failed;
			total.skipped += result.skipped;
			remaining -= result.processed;

			// A short batch means the queue is drained
			if (result.processed < batchLimit) break;
		}

		return total;
	} finally {
		await client.end({ timeout: 5 });
	}
}

export async function cancelNotificationOutboxItem(id: string) {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set");
	}

	const { client, db } = createDatabase(databaseUrl);
	try {
		const rows = await db
			.update(notificationOutbox)
			.set({ status: "cancelled" })
			.where(
				and(
					eq(notificationOutbox.id, id),
					eq(notificationOutbox.status, "pending"),
				),
			)
			.returning({ id: notificationOutbox.id });

		return rows.length > 0;
	} finally {
		await client.end({ timeout: 5 });
	}
}

export async function requeueNotificationOutboxItem(id: string) {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set");
	}

	const { client, db } = createDatabase(databaseUrl);
	try {
		const rows = await db
			.update(notificationOutbox)
			.set({
				status: "pending",
				attempts: 0,
				lastError: null,
				claimedAt: null,
				sentAt: null,
				scheduledFor: new Date(),
			})
			.where(
				and(
					eq(notificationOutbox.id, id),
					eq(notificationOutbox.status, "cancelled"),
				),
			)
			.returning({ id: notificationOutbox.id });

		return rows.length > 0;
	} finally {
		await client.end({ timeout: 5 });
	}
}
