import { defineConfig } from 'drizzle-kit'

// Generating migrations only diffs the TypeScript schema; no database connection is needed.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  strict: true,
  verbose: false,
})
