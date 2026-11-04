import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://devdigest:devdigest@localhost:5432/devdigest';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: DATABASE_URL },
  // pgvector `vector` type is provided by the extension that runMigrations()
  // (src/db/migrate.ts) creates before applying migrations — no .sql file does it.
  verbose: true,
  strict: true,
});
