/**
 * Backfill the prompt-injection scan over EXISTING skills.
 *
 * The injection scan (`src/modules/skills/injection.ts`) runs on every skill body
 * write, so skills created before migration 0013 have the column default
 * (`injection_detected = false`) without ever having been scanned. Run this once
 * after `pnpm db:migrate` to scan them. A skill that turns out to be flagged is
 * also force-disabled (same rule as the write path); skills that are clean are
 * left exactly as they were. Idempotent.
 *
 *   pnpm exec tsx scripts/scan-skills.ts              # scan + write
 *   pnpm exec tsx scripts/scan-skills.ts --dry-run    # report only
 *
 * Uses DATABASE_URL (default: the docker-compose Postgres).
 */
import { eq } from 'drizzle-orm';
import { createDb } from '../src/db/client.js';
import * as t from '../src/db/schema.js';
import { detectInjection } from '../src/modules/skills/injection.js';

type Matches = { rule: string; severity: string; line: number; excerpt: string }[];

/** Key-order-independent form: jsonb does not preserve object key order. */
const canon = (m: Matches) => JSON.stringify(m.map((x) => [x.rule, x.severity, x.line, x.excerpt]));

const DEFAULT_URL = 'postgres://devdigest:devdigest@localhost:5432/devdigest';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const handle = createDb(process.env.DATABASE_URL ?? DEFAULT_URL, { max: 1 });
  try {
    const rows = await handle.db.select().from(t.skills);
    let flagged = 0;
    let changed = 0;
    for (const row of rows) {
      const scan = detectInjection(row.body);
      if (scan.detected) {
        flagged++;
        console.log(
          `FLAGGED  ${row.name} (${row.id}) — ${scan.matches.map((m) => `${m.rule}@${m.line}`).join(', ')}`,
        );
      }
      const matches = scan.detected ? scan.matches : [];
      const same =
        row.injectionDetected === scan.detected &&
        canon(row.injectionMatches) === canon(matches) &&
        !(scan.detected && row.enabled);
      if (same) continue;
      changed++;
      if (dryRun) continue;
      await handle.db
        .update(t.skills)
        .set({
          injectionDetected: scan.detected,
          injectionMatches: matches,
          ...(scan.detected ? { enabled: false } : {}),
        })
        .where(eq(t.skills.id, row.id));
    }
    console.log(
      `${dryRun ? '[dry-run] ' : ''}scanned ${rows.length} skill(s): ${flagged} flagged, ${changed} ${dryRun ? 'would change' : 'updated'}`,
    );
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error('scan-skills failed:', err);
  process.exit(1);
});
