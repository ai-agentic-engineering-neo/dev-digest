import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * specs/18 (AC-35): the server and client copies of `dependency-graph.ts` are
 * hand-maintained (no sync script) and must stay byte-identical.
 */
const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rel = 'src/vendor/shared/contracts/dependency-graph.ts';

describe('dependency-graph contract parity', () => {
  it('server and client copies are byte-identical', () => {
    const server = readFileSync(resolve(serverRoot, rel));
    const client = readFileSync(resolve(serverRoot, '../client', rel));
    expect(client.equals(server)).toBe(true);
  });
});
