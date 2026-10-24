import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  // Drizzle writes Supabase-compatible migration files here; apply them with
  // the Supabase CLI (`supabase db reset` locally, `supabase db push` remotely).
  out: './supabase/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  migrations: {
    prefix: 'supabase',
  },
  strict: true,
  verbose: true,
})
