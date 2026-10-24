import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Server-side Drizzle client for the Supabase Postgres database.
 *
 * Use the direct connection or session pooler URL from Supabase. This client
 * connects with the credentials in DATABASE_URL, so it bypasses RLS when the
 * URL uses a privileged database role. Keep it on the server.
 */
export function createDatabase(databaseUrl = process.env.DATABASE_URL) {
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set");
	}

	const isRemote = /supabase\.(co|com)/.test(databaseUrl);

	const client = postgres(databaseUrl, {
		prepare: false,
		ssl: isRemote ? "require" : undefined,
	});

	return {
		client,
		db: drizzle(client, { schema }),
	};
}

export type Database = ReturnType<typeof createDatabase>["db"];

export * from "./schema";
