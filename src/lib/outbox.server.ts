import { and, eq, lte } from "drizzle-orm"
import { createDatabase } from "./db"
import { notificationOutbox, notificationSettings } from "./db/schema"
import {
  type EmailPayload,
  isEmailConfigured,
  renderEmail,
  sendEmail
} from "./email"
import type { EmailTemplate } from "./types"

const MAX_ATTEMPTS = 5
const BATCH_SIZE = 10
const TIME_BUDGET_MS = 40_000 // stop starting new batches before the serverless timeout

export interface DispatchResult {
  processed: number
  sent: number
  failed: number
  skipped: number
}

export async function dispatchNotificationOutbox(options?: {
  limit?: number
  retryFailed?: boolean
  onlyWhenAutomaticEnabled?: boolean
  id?: string
}): Promise<DispatchResult> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error("DATABASE_URL is not set")

  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100)
  const { client, db } = createDatabase(databaseUrl)
  const total: DispatchResult = { processed: 0, sent: 0, failed: 0, skipped: 0 }

  try {
    if (!isEmailConfigured()) return total

    const deadline = Date.now() + TIME_BUDGET_MS
    let remaining = options?.id ? 1 : limit
    let firstBatch = true

    while (remaining > 0 && Date.now() < deadline) {
      const batchLimit = Math.min(BATCH_SIZE, remaining)
      const isFirst = firstBatch
      firstBatch = false

      const batch = await db.transaction(async (tx) => {
        // Checked every batch, so flipping the toggle off stops the run
        // after at most 10 more emails.
        if (options?.onlyWhenAutomaticEnabled) {
          const [settings] = await tx
            .select({ enabled: notificationSettings.automaticEmailsEnabled })
            .from(notificationSettings)
            .limit(1)
          if (!settings?.enabled) return null
        }

        // Only reset failed rows once, not on every batch
        if (options?.retryFailed && isFirst) {
          await tx
            .update(notificationOutbox)
            .set({
              attempts: 0,
              status: "pending",
              lastError: null,
              scheduledFor: new Date()
            })
            .where(eq(notificationOutbox.status, "failed"))
        }

        const pending = await tx
          .select()
          .from(notificationOutbox)
          .where(
            options?.id
              ? and(
                  eq(notificationOutbox.id, options.id),
                  eq(notificationOutbox.status, "pending")
                )
              : and(
                  eq(notificationOutbox.status, "pending"),
                  lte(notificationOutbox.scheduledFor, new Date())
                )
          )
          .orderBy(notificationOutbox.scheduledFor)
          .limit(batchLimit)
          .for("update", { skipLocked: true })

        const result: DispatchResult = {
          processed: pending.length,
          sent: 0,
          failed: 0,
          skipped: 0
        }

        for (const item of pending) {
          const attempts = item.attempts + 1
          try {
            const rendered = renderEmail(
              item.template as EmailTemplate,
              (item.payload ?? {}) as EmailPayload
            )
            await sendEmail({
              to: { email: item.recipientEmail, name: item.recipientName },
              subject: rendered.subject,
              html: rendered.html,
              text: rendered.text
            })

            await tx
              .update(notificationOutbox)
              .set({
                status: "sent",
                attempts,
                sentAt: new Date(),
                lastError: null
              })
              .where(eq(notificationOutbox.id, item.id))

            result.sent += 1
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown delivery error"
            const exhausted = attempts >= MAX_ATTEMPTS

            await tx
              .update(notificationOutbox)
              .set({
                status: exhausted ? "failed" : "pending",
                attempts,
                lastError: message.slice(0, 1000),
                scheduledFor: exhausted
                  ? item.scheduledFor
                  : new Date(Date.now() + attempts * 60_000)
              })
              .where(eq(notificationOutbox.id, item.id))

            if (exhausted) result.failed += 1
            else result.skipped += 1
          }
        }

        return result
      })

      // Toggle off, or nothing left to process
      if (!batch || batch.processed === 0) break

      total.processed += batch.processed
      total.sent += batch.sent
      total.failed += batch.failed
      total.skipped += batch.skipped
      remaining -= batch.processed

      // A short batch means the queue is drained
      if (batch.processed < batchLimit) break
    }

    return total
  } finally {
    await client.end({ timeout: 5 })
  }
}

export async function cancelNotificationOutboxItem(id: string) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set")
  }

  const { client, db } = createDatabase(databaseUrl)
  try {
    const rows = await db
      .update(notificationOutbox)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(notificationOutbox.id, id),
          eq(notificationOutbox.status, "pending")
        )
      )
      .returning({ id: notificationOutbox.id })

    return rows.length > 0
  } finally {
    await client.end({ timeout: 5 })
  }
}

export async function requeueNotificationOutboxItem(id: string) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set")
  }

  const { client, db } = createDatabase(databaseUrl)
  try {
    const rows = await db
      .update(notificationOutbox)
      .set({
        status: "pending",
        attempts: 0,
        lastError: null,
        sentAt: null,
        scheduledFor: new Date()
      })
      .where(
        and(
          eq(notificationOutbox.id, id),
          eq(notificationOutbox.status, "cancelled")
        )
      )
      .returning({ id: notificationOutbox.id })

    return rows.length > 0
  } finally {
    await client.end({ timeout: 5 })
  }
}
