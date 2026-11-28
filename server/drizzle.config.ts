import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://devdigest:devdigest@localhost:5432/devdigest';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: DATABASE_URL },
  // pgvector `vector` type is provided by the extension enabled by `migrate.ts` before the
  // migrations run (migration 0000 needs it; 0011 repeats the statement).
  verbose: true,
  strict: true,
});
