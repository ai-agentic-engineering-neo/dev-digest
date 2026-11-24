import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Onion Architecture gate (skill: .claude/skills/onion-architecture).
 *
 * Runs dependency-cruiser with server/.dependency-cruiser.cjs over src/ (plus the
 * reviewer-core sources reached through the path alias) and fails on any violation
 * that is not in the known-violations baseline.
 *
 * The baseline freezes legacy violations; it may only SHRINK. After migrating code,
 * regenerate it from server/:  pnpm exec depcruise-baseline src --config .dependency-cruiser.cjs
 * Never regenerate it to make a new violation pass — fix the import instead.
 */

const serverRoot = path.resolve(__dirname, '..');
// A direct dependency is always linked at server/node_modules/<name> under pnpm; its
// `exports` map hides package.json, so require.resolve can't locate the bin.
const depcruiseBin = path.join(serverRoot, 'node_modules/dependency-cruiser/bin/dependency-cruise.mjs');

interface Violation {
  type: string;
  from: string;
  to: string;
  rule: { name: string; severity: string };
  cycle?: { name: string }[] | string[];
}

/**
 * pnpm store paths embed versions and peer hashes
 * (node_modules/.pnpm/drizzle-orm@0.45.4_gel@2.2.1_postgres@3.4.9/node_modules/drizzle-orm/index.d.ts);
 * collapse them to the package name so a routine dependency bump doesn't break the baseline.
 */
function normalizeTarget(p: string): string {
  const m = /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/.exec(p);
  return m ? `npm:${m[1]}` : p;
}

const key = (v: Pick<Violation, 'from' | 'to' | 'rule'>) =>
  `${v.rule.name} | ${v.from} → ${normalizeTarget(v.to)}`;

function runCruise(): Violation[] {
  const res = spawnSync(
    process.execPath,
    [depcruiseBin, 'src', '--config', '.dependency-cruiser.cjs', '--output-type', 'json', '--no-progress'],
    { cwd: serverRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  // depcruise exits non-zero when it finds violations; only a missing/invalid JSON is a crash.
  let parsed: { summary: { violations: Violation[]; error: number } };
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    throw new Error(`dependency-cruiser did not produce JSON (exit ${res.status}):\n${res.stderr}`);
  }
  return parsed.summary.violations.filter((v) => v.rule.severity === 'error');
}

describe('onion architecture (dependency-cruiser)', () => {
  const violations = runCruise();
  const known = new Set(
    (
      JSON.parse(
        readFileSync(path.join(serverRoot, '.dependency-cruiser-known-violations.json'), 'utf8'),
      ) as Violation[]
    ).map(key),
  );

  it('introduces no new inward-dependency violations', () => {
    const fresh = [...new Set(violations.map(key))].filter((k) => !known.has(k)).sort();
    expect(
      fresh,
      'New architecture violations. Fix the import (see .claude/skills/onion-architecture/SKILL.md) — do not add them to the baseline.',
    ).toEqual([]);
  });

  it('keeps the baseline free of entries that are already fixed', () => {
    const current = new Set(violations.map(key));
    const stale = [...known].filter((k) => !current.has(k)).sort();
    expect(
      stale,
      'These baseline entries no longer occur — regenerate the baseline so it can only shrink: pnpm exec depcruise-baseline src --config .dependency-cruiser.cjs',
    ).toEqual([]);
  });
});
