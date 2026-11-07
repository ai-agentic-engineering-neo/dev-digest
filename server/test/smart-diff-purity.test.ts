import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILES = ['classify', 'constants', 'glob'];

function importsOf(name: string): { spec: string; typeOnly: boolean }[] {
  const url = new URL(`../src/modules/smart-diff/${name}.ts`, import.meta.url);
  const text = readFileSync(fileURLToPath(url), 'utf8');
  const out: { spec: string; typeOnly: boolean }[] = [];
  const re = /^\s*(?:import|export)\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;
  for (const m of text.matchAll(re)) {
    out.push({ spec: (m[2] ?? m[3]) as string, typeOnly: Boolean(m[1]) });
  }
  return out;
}

describe('smart-diff classifier purity', () => {
  it.each(FILES)('%s.ts has no infrastructural imports', (name) => {
    const imports = importsOf(name);
    for (const { spec, typeOnly } of imports) {
      expect(spec).not.toMatch(/^(fastify|@fastify\/|drizzle-orm|postgres|node:)/);
      expect(spec).not.toMatch(/\/(db|adapters|platform)\//);
      if (!spec.startsWith('.')) {
        expect(spec).toBe('@devdigest/shared');
        expect(typeOnly).toBe(true);
      }
    }
  });
});
