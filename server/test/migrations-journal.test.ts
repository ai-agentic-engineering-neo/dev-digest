import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * drizzle's migrator skips any migration whose `when` is <= the newest applied
 * one, so a non-monotonic journal silently drops migrations. 0023/0024 are a
 * known hazard (plans/17 R2/H5) and deliberately not asserted; the invariant
 * is enforced from 0025 onward.
 */
const journalPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/db/migrations/meta/_journal.json',
);

describe('migrations journal', () => {
  it('has strictly increasing `when` from 0025 onward', () => {
    const { entries } = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { idx: number; when: number; tag: string }[];
    };
    const tail = entries.filter((e) => e.idx >= 25);
    expect(tail.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < tail.length; i++) {
      expect(tail[i]!.when, `${tail[i]!.tag} must be > ${tail[i - 1]!.tag}`).toBeGreaterThan(
        tail[i - 1]!.when,
      );
    }
  });
});
