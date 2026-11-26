import { and, eq } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

/**
 * M2 demo skills: six manual skills, three attached to Security Reviewer.
 * Idempotent by (workspace, name): an existing skill is left untouched (a user
 * may have edited it), a missing one is inserted at v1 with its
 * `Initial version` snapshot in the same transaction.
 */

type SeedSkill = Pick<
  typeof t.skills.$inferInsert,
  'name' | 'description' | 'type' | 'body'
>;

export const PR_QUALITY_RUBRIC = `# PR quality rubric

Score every pull request against these five dimensions. Report a finding for
each dimension that falls below **Meets bar**; do not report dimensions that pass.

## 1. Scope
- The PR does **one thing**. Unrelated refactors, renames or formatting churn
  belong in a separate PR.
- Diffs over ~400 changed lines need a reason in the description.

## 2. Correctness
- Every new branch has a test, or the description says why it cannot.
- Error paths are handled, not swallowed (\`catch {}\` with no comment is a finding).
- No behaviour change hides behind a refactor commit.

## 3. Readability
- Names say what a thing is, not how it is computed.
- Functions stay under ~50 lines; deeper nesting than three levels is a smell.
- Comments explain **why**, never restate **what**.

## 4. Safety
- Public API, DB schema or contract changes are called out in the description.
- Migrations are additive or come with a rollout note.
- No secrets, tokens or personal data in code, fixtures or logs.

## 5. Description
- Says what changed, why, and how it was tested.
- Links the issue or spec it implements.

| Rating | Meaning |
|---|---|
| Exceeds | Nothing to add; a model PR |
| Meets bar | Mergeable after nits |
| Below bar | Needs changes before merge |
`;

const SECRET_LEAKAGE_GATE = `# Secret leakage gate

Block the merge when the diff adds a credential. Report each one as **CRITICAL**.

## Flag
- Provider keys: \`sk_live_\`, \`sk-\`, \`AKIA\`, \`ghp_\`, \`xoxb-\`, \`AIza\`.
- Private keys: \`-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----\`.
- Connection strings with an inline password (\`postgres://user:pass@\`).
- High-entropy strings (≥ 32 chars) assigned to names like \`token\`, \`secret\`,
  \`password\`, \`apiKey\`.
- \`.env\` files, \`*.pem\`, \`id_rsa\` added to the repo.
- Secrets written to logs, error messages or analytics events.

## Do not flag
- Obvious placeholders: \`changeme\`, \`xxx\`, \`<your-key>\`, \`sk_test_\` in docs.
- Reads from \`process.env\` or a secrets manager.

## Suggestion
Move the value to the environment or the secrets provider, and tell the author
to **rotate** the key: once pushed, it is compromised even if the commit is reverted.
`;

const LETHAL_TRIFECTA = `# Lethal trifecta

Flag an AI-agent flow that combines all three of:

1. **Untrusted input**: PR text, issue bodies, web pages, email, tool output.
2. **Access to private data**: secrets, the DB, private repos, user records.
3. **An exfiltration channel**: outbound HTTP, rendered links or images,
   writes to a public place, emails.

Any two are fine. All three in one flow let a prompt injection steal data.

## How to report
- Severity **CRITICAL**, one finding per flow.
- Name each leg with the file and line where it enters the flow.
- Suggest cutting one leg: drop the outbound channel, gate it behind human
  approval, or strip private data before untrusted content is processed.

## Do not flag
- Ordinary access control on sensitive data with no untrusted input.
- Untrusted input that only reaches a sandbox with no private data.
`;

const INJECTION_SINKS = `# Injection sinks

Trace user-controlled input to these sinks and flag any path without
parameterisation or an allow-list.

| Sink | Safe pattern |
|---|---|
| SQL (\`sql.raw\`, string-built queries) | Bound parameters / query builder |
| Shell (\`exec\`, \`spawn\` with \`shell: true\`) | \`execFile\` with an argv array |
| File paths (\`fs.*\`, \`path.join\` with input) | Resolve, then check it stays under the root |
| Outbound URLs (\`fetch\`, \`axios\` with input) | Host allow-list (SSRF) |
| HTML (\`dangerouslySetInnerHTML\`, \`innerHTML\`) | Escape or sanitise |
| Regex built from input | Escape, or cap length (ReDoS) |

Severity: **CRITICAL** when reachable from an unauthenticated route, otherwise
**WARNING**. Quote the source line and the sink line in the rationale.
`;

const N_PLUS_ONE_QUERIES = `# N+1 queries

A query inside a loop over rows from another query is an N+1.

## Flag
- \`await db.select…\` / \`findOne\` inside \`for\`, \`map\`, \`forEach\`.
- \`Promise.all(items.map(i => repo.get(i.id)))\` on an unbounded list.
- A list endpoint whose DTO mapper does a lookup per row.

## Suggest
- One \`IN (…)\` / \`inArray\` query, then group in memory.
- A join or a grouped \`count()\` for per-row counters.
- A bounded batch size when the list can grow without limit.

Severity **WARNING**; **CRITICAL** on a hot path (list pages, webhooks, polling).
`;

const MIGRATION_SAFETY = `# Migration safety

Every schema change must be safe to deploy while the previous version still runs.

- **Add** columns as nullable or with a default; never \`NOT NULL\` without one.
- **Rename / drop** in two releases: stop reading, then drop.
- **Indexes** on large tables: \`CREATE INDEX CONCURRENTLY\`.
- **Unique constraints**: check existing data for duplicates first.
- Never edit a migration that has already been applied; add a new one.
- Backfills run in batches, not in the migration transaction.

Flag violations as **WARNING**, data-loss risks (drop, type narrowing) as **CRITICAL**.
`;

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'pr-quality-rubric',
    description: 'Five-dimension rubric for scope, correctness, readability, safety and description.',
    type: 'rubric',
    body: PR_QUALITY_RUBRIC,
  },
  {
    name: 'secret-leakage-gate',
    description: 'Blocks merges that add keys, tokens or private keys to the diff.',
    type: 'security',
    body: SECRET_LEAKAGE_GATE,
  },
  {
    name: 'lethal-trifecta',
    description: 'Flags agent flows mixing untrusted input, private data and exfiltration.',
    type: 'security',
    body: LETHAL_TRIFECTA,
  },
  {
    name: 'injection-sinks',
    description: 'Traces user input to SQL, shell, path, URL and HTML sinks.',
    type: 'security',
    body: INJECTION_SINKS,
  },
  {
    name: 'n-plus-one-queries',
    description: 'Catches queries inside loops and per-row lookups in list endpoints.',
    type: 'convention',
    body: N_PLUS_ONE_QUERIES,
  },
  {
    name: 'migration-safety',
    description: 'Zero-downtime rules for schema migrations and backfills.',
    type: 'custom',
    body: MIGRATION_SAFETY,
  },
];

/** Attached to Security Reviewer, in this order. */
export const SECURITY_REVIEWER_SKILLS = ['secret-leakage-gate', 'lethal-trifecta', 'injection-sinks'];
export const SECURITY_REVIEWER_NAME = 'Security Reviewer';

export async function seedSkills(db: Db, workspaceId: string): Promise<void> {
  // Names inserted by THIS run: only those get linked, so a re-seed never
  // re-attaches a skill the user detached from Security Reviewer.
  const inserted = new Map<string, string>();
  for (const s of SEED_SKILLS) {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({ ...s, workspaceId, source: 'manual', enabled: true, version: 1 })
        .onConflictDoNothing({ target: [t.skills.workspaceId, t.skills.name] })
        .returning({ id: t.skills.id });
      if (!row) return; // already seeded (or user-created with the same name)
      await tx
        .insert(t.skillVersions)
        .values({ skillId: row.id, version: 1, body: s.body, message: 'Initial version' });
      inserted.set(s.name!, row.id);
    });
  }

  const links = SECURITY_REVIEWER_SKILLS.flatMap((name, order) => {
    const skillId = inserted.get(name);
    return skillId ? [{ skillId, order }] : [];
  });
  if (links.length === 0) return;

  const [agent] = await db
    .select({ id: t.agents.id })
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, SECURITY_REVIEWER_NAME)));
  if (!agent) return;
  await db
    .insert(t.agentSkills)
    .values(links.map((l) => ({ agentId: agent.id, ...l })))
    .onConflictDoNothing();
}
