#!/usr/bin/env node
/**
 * Onion Architecture layer check with a version-proof baseline.
 * Rules: .dependency-cruiser.cjs · Skill: ../.claude/skills/onion-architecture/SKILL.md
 *
 * Usage (from server/):
 *   node scripts/check-architecture.mjs                 # fail on NEW error-level violations
 *   node scripts/check-architecture.mjs --update        # rewrite the baseline (after FIXING violations)
 *   node scripts/check-architecture.mjs --base <file>   # also fail if the baseline grew vs <file>
 *
 * Why not dependency-cruiser's own `--ignore-known`: it matches on resolved paths, and with pnpm those
 * contain the package version and entry file (`node_modules/.pnpm/drizzle-orm@0.38.4_…/index.d.ts`),
 * so every dependency upgrade would make known violations look new. Here each violation is reduced to
 * a stable key `rule|from|to`, where an npm target is just `node_modules/<package>`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(SERVER_DIR, 'architecture-baseline.json');
const DEPCRUISE = join(SERVER_DIR, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruise.mjs');

const args = process.argv.slice(2);
const update = args.includes('--update');
const baseIdx = args.indexOf('--base');
const baseFile = baseIdx >= 0 ? args[baseIdx + 1] : undefined;

/** `node_modules/.pnpm/x@1.2.3/node_modules/@scope/pkg/dist/index.d.ts` → `node_modules/@scope/pkg` */
function normalizeTarget(path) {
  const m = /(?:^|\/)node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/.exec(path);
  return m ? `node_modules/${m[1]}` : path;
}

function keyOf(v) {
  if (v.type === 'cycle' && Array.isArray(v.cycle)) {
    // A cycle may be reported from any member — key it by its sorted members.
    const members = [v.from, ...v.cycle.map((c) => c.name)].map(normalizeTarget);
    return `${v.rule.name}|cycle|${[...new Set(members)].sort().join(' ⇄ ')}`;
  }
  return `${v.rule.name}|${v.from}|${normalizeTarget(v.to)}`;
}

function cruise() {
  const dir = mkdtempSync(join(tmpdir(), 'depcruise-'));
  const out = join(dir, 'result.json');
  try {
    try {
      execFileSync(
        process.execPath,
        [DEPCRUISE, 'src', '--config', '.dependency-cruiser.cjs', '--output-type', 'json', '--output-to', out],
        { cwd: SERVER_DIR, stdio: ['ignore', 'inherit', 'inherit'] },
      );
    } catch (err) {
      // depcruise exits non-zero when violations exist; the JSON is still written.
      if (!existsSync(out)) throw err;
    }
    const { summary } = JSON.parse(readFileSync(out, 'utf8'));
    const bySeverity = new Map();
    for (const v of summary.violations) bySeverity.set(keyOf(v), v.rule.severity);
    return bySeverity;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const readKeys = (file) => new Set(JSON.parse(readFileSync(file, 'utf8')));
const list = (title, keys) => keys.length && console.log(`${title}\n${keys.map((k) => `  - ${k}`).join('\n')}`);

const current = cruise();

if (update) {
  const keys = [...current.keys()].sort();
  writeFileSync(BASELINE, `${JSON.stringify(keys, null, 2)}\n`);
  console.log(`✔ baseline written: ${keys.length} known violations → ${BASELINE}`);
  process.exit(0);
}

let failed = false;
const known = existsSync(BASELINE) ? readKeys(BASELINE) : new Set();

const newErrors = [...current].filter(([k, sev]) => sev === 'error' && !known.has(k)).map(([k]) => k);
const newWarns = [...current].filter(([k, sev]) => sev !== 'error' && !known.has(k)).map(([k]) => k);
const fixed = [...known].filter((k) => !current.has(k));

if (newErrors.length) {
  failed = true;
  list('✖ NEW layer violations (fix them — see .claude/skills/onion-architecture/examples.md):', newErrors);
}
list('‼ new warnings (not failing):', newWarns);
if (fixed.length) {
  list('ℹ fixed since baseline — shrink it with `node scripts/check-architecture.mjs --update`:', fixed);
}

if (baseFile) {
  if (!existsSync(baseFile)) {
    console.log(`ℹ no base baseline at ${baseFile} — skipping growth check`);
  } else {
    const base = readKeys(baseFile);
    const grown = [...known].filter((k) => !base.has(k));
    if (grown.length) {
      failed = true;
      list('✖ architecture-baseline.json GREW vs the base branch — the baseline may only shrink:', grown);
    }
  }
}

if (!failed) console.log(`✔ no new layer violations (${current.size} current, ${known.size} in baseline)`);
process.exit(failed ? 1 : 0);
