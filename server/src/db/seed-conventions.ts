import { and, eq } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

/**
 * Three PENDING demo conventions for the seeded `acme/payments-api` repo, so
 * the Conventions page (and the e2e journeys) have candidates to triage
 * without an LLM key. They are plain rows: the evidence here is illustrative
 * and is NOT re-verified against a clone (only a real scan runs the gate).
 *
 * Idempotent: seeds only when the repo has no conventions yet, so a re-seed
 * never resurrects a rule the user already rejected or duplicates one.
 */
const DEMO_CONVENTIONS = [
  {
    category: 'errors' as const,
    rule: 'Throw a typed AppError subclass instead of returning null for a missing row',
    rationale: 'Route handlers rely on the error handler to map it to a 404, never on null checks.',
    evidencePath: 'src/services/payments.ts',
    evidenceLine: 42,
    evidenceSnippet: 'if (!payment) throw new NotFoundError("Payment not found");',
    evidenceFiles: ['src/services/payments.ts', 'src/services/refunds.ts'],
    occurrences: 2,
    confidence: 0.92,
  },
  {
    category: 'api' as const,
    rule: 'Validate every request body and params with a zod schema on the route definition',
    rationale: 'Validation happens once at the boundary; handlers only ever see parsed input.',
    evidencePath: 'src/routes/payments.ts',
    evidenceLine: 18,
    evidenceSnippet: "app.post('/payments', { schema: { body: CreatePaymentBody } }, handler);",
    evidenceFiles: ['src/routes/payments.ts', 'src/routes/refunds.ts', 'src/routes/customers.ts'],
    occurrences: 3,
    confidence: 0.85,
  },
  {
    category: 'imports' as const,
    rule: 'Import local modules with an explicit .js extension (ESM)',
    rationale: 'The service compiles to native ESM, where extensionless relative imports fail at runtime.',
    evidencePath: 'src/services/payments.ts',
    evidenceLine: 3,
    evidenceSnippet: "import { db } from '../db/client.js';",
    evidenceFiles: ['src/services/payments.ts'],
    occurrences: 1,
    confidence: 0.7,
  },
];

export async function seedConventions(db: Db, workspaceId: string, repoId: string): Promise<void> {
  const existing = await db
    .select({ id: t.conventions.id })
    .from(t.conventions)
    .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
    .limit(1);
  if (existing.length > 0) return;

  await db
    .insert(t.conventions)
    .values(DEMO_CONVENTIONS.map((c) => ({ ...c, workspaceId, repoId, status: 'pending' as const })));
}
