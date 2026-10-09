import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * specs/14-export-to-ci.md (Phase A verification, AC-49's own mechanical
 * check) — `server/src/vendor/shared` and `client/src/vendor/shared` are
 * independent copies with no sync script (root CLAUDE.md's "do-not-touch"
 * note; `server/LEARNINGS.md`'s 2026-07-28 "vendor/shared copies have
 * already drifted" entry). This test makes drift a CI failure instead of
 * something someone has to remember to `diff` by hand — specifically for the
 * Export-to-CI / Agent Performance contracts this feature added or extended.
 */

const SERVER_EVAL_CI = resolve(import.meta.dirname, '../src/vendor/shared/contracts/eval-ci.ts');
const CLIENT_EVAL_CI = resolve(import.meta.dirname, '../../client/src/vendor/shared/contracts/eval-ci.ts');
const SERVER_PRODUCTIONIZE = resolve(import.meta.dirname, '../src/vendor/shared/contracts/productionize.ts');
const CLIENT_PRODUCTIONIZE = resolve(import.meta.dirname, '../../client/src/vendor/shared/contracts/productionize.ts');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Extract the `// Agent Performance ...` block — from its own section
 *  header comment up to (not including) the next section's header comment —
 *  rather than diffing the whole file, since `productionize.ts` also carries
 *  plugin-export and weekly-digest contracts unrelated to this feature. */
function extractAgentPerfBlock(source: string): string {
  const startMarker = '// Agent Performance  (GET /agents/performance)';
  const start = source.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`Could not find the Agent Performance section header in productionize.ts`);
  }
  const rest = source.slice(start);
  // Each section header is a 3-line comment block: an opening `// ---`
  // divider (not included — sliced off above), the title line (`rest`
  // starts here), then a CLOSING `// ---` divider that's still part of THIS
  // section's own header. The real next-section boundary is the divider
  // AFTER that one — hence skipping past the first match before searching.
  const ownClosingDivider = rest.indexOf('\n// ---', 1);
  const nextDividerOffset = rest.indexOf('\n// ---', ownClosingDivider + 1);
  return nextDividerOffset === -1 ? rest : rest.slice(0, nextDividerOffset);
}

describe('vendor/shared contract parity (server vs client copies)', () => {
  it('eval-ci.ts is byte-identical between server and client vendor/shared copies', () => {
    const server = read(SERVER_EVAL_CI);
    const client = read(CLIENT_EVAL_CI);
    expect(client).toBe(server);
  });

  it('productionize.ts\'s Agent Performance (AgentPerf/AgentPerfRow) block is identical between copies', () => {
    const server = extractAgentPerfBlock(read(SERVER_PRODUCTIONIZE));
    const client = extractAgentPerfBlock(read(CLIENT_PRODUCTIONIZE));
    expect(client).toBe(server);
  });

  it('sanity: the extracted Agent Performance block actually contains AgentPerf/AgentPerfRow (the extraction markers still match the file)', () => {
    const block = extractAgentPerfBlock(read(SERVER_PRODUCTIONIZE));
    expect(block).toContain('export const AgentPerfRow');
    expect(block).toContain('export const AgentPerf ');
    expect(block).toContain('runs_local');
    expect(block).toContain('runs_ci');
  });
});
