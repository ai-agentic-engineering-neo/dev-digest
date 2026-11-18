import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { walkClone } from '../src/modules/repo-intel/pipeline/walk.js';

// Regression: the pipeline handed the resolver only SUPPORTED_EXT files, so no
// tsconfig.json was ever visible and every `paths` alias stayed unresolved in
// production even though the fixture gate (full file set) was green.
describe('walkClone — json files for the module resolver', () => {
  const root = fileURLToPath(new URL('./fixtures/depgraph', import.meta.url));

  it('returns tsconfig files in jsonFiles and keeps them out of the parse set', async () => {
    const walk = await walkClone(root);
    const tsconfigs = walk.jsonFiles.filter((f) => /(^|\/)tsconfig[^/]*\.json$/.test(f));
    expect(tsconfigs.length).toBeGreaterThan(0);
    expect(walk.files.some((f) => f.endsWith('.json'))).toBe(false);
  });
});
