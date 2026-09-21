/**
 * docs/agent-prompts/*.md are the human-readable originals of the built-in
 * reviewer prompts seeded into the DB (server/CLAUDE.md's "one rule": the DB
 * is authoritative at runtime, the .md files are kept in sync by hand after
 * every edit via `PUT /agents/:id`). Nothing enforces that today for the
 * SEED source itself — this script is the offline half that can: it diffs
 * each `*_PROMPT` constant in `src/db/seed-prompts.ts` against its `.md`
 * mirror, with no DB required.
 *
 * This does NOT check a live database's `agents.system_prompt` column against
 * these files — that would require a seeded DB connection and is a separate,
 * heavier concern than CI can cheaply cover. If you edited a prompt via the
 * studio UI (not by editing seed-prompts.ts + re-seeding), this script can't
 * see that drift; only `PUT /agents/:id` discipline (see docs/agent-prompts/CLAUDE.md)
 * catches that case.
 *
 *   pnpm exec tsx scripts/check-agent-prompt-sync.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
  PR_SELF_REVIEW_PROMPT,
} from '../src/db/seed-prompts.js';

const here = dirname(fileURLToPath(import.meta.url));
const docsDir = join(here, '..', '..', 'docs', 'agent-prompts');

const pairs: [string, string][] = [
  ['general-reviewer.md', GENERAL_REVIEWER_PROMPT],
  ['security-reviewer.md', SECURITY_REVIEWER_PROMPT],
  ['performance-reviewer.md', PERFORMANCE_REVIEWER_PROMPT],
  ['test-quality-reviewer.md', TEST_QUALITY_REVIEWER_PROMPT],
  ['pr-self-review.md', PR_SELF_REVIEW_PROMPT],
];

let ok = true;
for (const [file, prompt] of pairs) {
  const path = join(docsDir, file);
  const md = readFileSync(path, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
  if (md !== prompt) {
    ok = false;
    console.error(`DRIFT: docs/agent-prompts/${file} does not match seed-prompts.ts`);
  } else {
    console.log(`OK: docs/agent-prompts/${file} matches seed-prompts.ts`);
  }
}

if (!ok) {
  console.error(
    '\nFix: copy the current seed-prompts.ts constant into the .md file (or vice versa), ' +
      'then re-run this script. See docs/agent-prompts/CLAUDE.md for the full sync rule ' +
      '(this only covers the seed source; a prompt edited live via PUT /agents/:id also ' +
      'needs its .md mirror updated by hand).',
  );
  process.exit(1);
}
