import type { UnifiedDiff } from '@devdigest/shared';

/**
 * Pre-parsed single-file diff fixture (what the server's diff parser produces
 * for this raw text). Kept local so reviewer-core tests never import server code.
 * Line 11 is the added `stripeKey` line — the grounded citation target.
 */
export const CONFIG_DIFF_RAW =
  'diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';

export function configDiff(): UnifiedDiff {
  return {
    raw: CONFIG_DIFF_RAW,
    files: [
      {
        path: 'src/config.ts',
        additions: 1,
        deletions: 0,
        hunks: [
          {
            file: 'src/config.ts',
            oldStart: 10,
            oldLines: 3,
            newStart: 10,
            newLines: 4,
            newLineNumbers: [10, 11, 12],
          },
        ],
      },
    ],
  };
}

/** The config diff plus a copy renamed to `other` → a two-file diff (map-reduce). */
export function twoFileDiff(other = 'src/other.ts'): UnifiedDiff {
  const base = configDiff();
  const file = base.files[0]!;
  const second = {
    ...file,
    path: other,
    hunks: file.hunks.map((h) => ({ ...h, file: other })),
  };
  return {
    raw: `${base.raw}\n${base.raw.replaceAll(file.path, other)}`,
    files: [file, second],
  };
}
