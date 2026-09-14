import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * specs/12-eval-pipeline.md AC-50/AC-57 — mechanical check that both
 * `vendor/shared` copies of the affected contracts agree, allowing ONLY the
 * three pre-existing drift blocks named in the plan (§1): the `openrouter`
 * comment + `CiFailOn` comment + `AgentVersion*` block in `knowledge.ts`, and
 * the `Provider`/`CiFailOn` import names + `AgentManifest` block +
 * `ConformanceInput.provider` arity in `eval-ci.ts`. Fails loudly if this
 * feature adds a FOURTH divergence.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const serverContracts = path.resolve(here, '../src/vendor/shared/contracts');
const clientContracts = path.resolve(here, '../../client/src/vendor/shared/contracts');

function read(root: string, file: string): string {
  return readFileSync(path.join(root, file), 'utf8');
}

/** Extract the text strictly between two markers (both exclusive of the
 *  second marker line), so a change OUTSIDE the Eval region never masks a
 *  change INSIDE it, and vice versa. */
function between(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const end = text.indexOf(endMarker, start);
  if (end === -1) throw new Error(`marker not found: ${endMarker}`);
  return text.slice(start, end);
}

describe('AC-50 — vendor/shared contract parity', () => {
  it('knowledge.ts: the Eval region is byte-identical in both copies', () => {
    const serverText = between(
      read(serverContracts, 'knowledge.ts'),
      '// ---- Eval ----',
      '// ---- Memory ----',
    );
    const clientText = between(
      read(clientContracts, 'knowledge.ts'),
      '// ---- Eval ----',
      '// ---- Memory ----',
    );
    expect(clientText).toBe(serverText);
  });

  it('eval-ci.ts: outside the three pre-existing drift hunks, the file is byte-identical', () => {
    const normalize = (text: string): string =>
      text
        // Drift #1 — the `Provider`/`CiFailOn` import names, present server-side
        // only because `AgentManifest` (a DIFFERENT section) needs them.
        .replace(/^import \{[\s\S]*?\} from '\.\/knowledge\.js';$/m, '__IMPORT__')
        // Drift #2 — the whole `AgentManifest` block, server-only.
        .replace(
          /\/\*\*\n \* AgentManifest[\s\S]*?export type AgentManifestInput = z\.input<typeof AgentManifest>;\n\n/,
          '',
        )
        // Drift #3 — `ConformanceInput.provider`'s enum arity.
        .replace(
          /provider: z\.enum\(\['openai', 'anthropic'(?:, 'openrouter')?\]\)\.nullish\(\),/,
          "provider: z.enum(['openai', 'anthropic']).nullish(),",
        );

    const serverText = normalize(read(serverContracts, 'eval-ci.ts'));
    const clientText = normalize(read(clientContracts, 'eval-ci.ts'));
    expect(clientText).toBe(serverText);
  });
});
