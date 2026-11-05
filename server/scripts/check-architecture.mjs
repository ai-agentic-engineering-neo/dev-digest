#!/usr/bin/env node
/**
 * Onion Architecture layer check with a version-proof baseline.
 * Rules: .dependency-cruiser.cjs · Skill: ../.claude/skills/onion-architecture/SKILL.md
 *
 * Usage (from server/):
 *   node scripts/check-architecture.mjs                 # fail on NEW error-level violations
 *   node scripts/check-architecture.mjs --update        # rewrite the baseline (after FIXING violations)
 *   node scripts/check-architecture.mjs --base <file>   # also fail if the baseline grew vs <file>
 *   node scripts/check-architecture.mjs --self-test     # prove every rule actually fires (probe files)
 *
 * Why not dependency-cruiser's own `--ignore-known`: it matches on resolved paths, and with pnpm those
 * contain the package version and entry file (`node_modules/.pnpm/drizzle-orm@0.38.4_…/index.d.ts`),
 * so every dependency upgrade would make known violations look new. Here each violation is reduced to
 * a stable key `rule|from|to`, where an npm target is just `node_modules/<package>`.
 *
 * Why --self-test: a rule can be silently dead (wrong path, or its target removed from the graph by
 * `options.exclude` — that happened to `domain-shared-type-only`). A clean run can't tell "no
 * violations" from "rule never fires", so the self-test writes probe files that MUST trigger each
 * rule (and negative probes that must NOT), and fails if any rule has no probe.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(SERVER_DIR, '.dependency-cruiser.cjs');
const BASELINE = join(SERVER_DIR, 'architecture-baseline.json');
const DEPCRUISE = join(SERVER_DIR, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruise.mjs');

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

/** Run dependency-cruiser on `targets` (relative to server/) and return its raw violations. */
function cruise(targets = ['src']) {
  const dir = mkdtempSync(join(tmpdir(), 'depcruise-'));
  const out = join(dir, 'result.json');
  try {
    try {
      execFileSync(
        process.execPath,
        [DEPCRUISE, ...targets, '--config', CONFIG, '--output-type', 'json', '--output-to', out],
        { cwd: SERVER_DIR, stdio: ['ignore', 'inherit', 'inherit'] },
      );
    } catch (err) {
      // depcruise exits non-zero when violations exist; the JSON is still written.
      if (!existsSync(out)) throw err;
    }
    return JSON.parse(readFileSync(out, 'utf8')).summary.violations;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const readKeys = (file) => new Set(JSON.parse(readFileSync(file, 'utf8')));
const list = (title, keys) => keys.length && console.log(`${title}\n${keys.map((k) => `  - ${k}`).join('\n')}`);

// ---------------------------------------------------------------------------------------------
// --self-test
// ---------------------------------------------------------------------------------------------

const PROBE_A = 'src/modules/__onion_probe_a__';
const PROBE_B = 'src/modules/__onion_probe_b__';
const PROBE_ADAPTER = 'src/adapters/__onion_probe__';

/** file → content. Paths/imports chosen so each positive probe triggers exactly one rule. */
const PROBE_FILES = {
  [`${PROBE_A}/domain.ts`]: `import { sql } from 'drizzle-orm';\nexport const probe = sql;\n`,
  [`${PROBE_A}/domain/shared-runtime.ts`]: `import { Finding } from '@devdigest/shared';\nexport const probe = Finding;\n`,
  [`${PROBE_A}/routes.ts`]: `import { sql } from 'drizzle-orm';\nexport const probe = sql;\n`,
  // routes.ts must sit directly in a module folder, so the routes→adapter probe lives in module B.
  [`${PROBE_B}/routes.ts`]: `import { MockLLMProvider } from '../../adapters/mocks.js';\nexport const probe = MockLLMProvider;\n`,
  [`${PROBE_A}/service.ts`]: `import { sql } from 'drizzle-orm';\nexport const probe = sql;\n`,
  [`${PROBE_A}/rows-user.ts`]: `import type { AgentRow } from '../../db/rows.js';\nexport type Probe = AgentRow;\n`,
  [`${PROBE_A}/adapter-user.ts`]: `import { MockLLMProvider } from '../../adapters/mocks.js';\nexport const probe = MockLLMProvider;\n`,
  [`${PROBE_A}/cross-module.ts`]: `import { probe as other } from '../__onion_probe_b__/helpers.js';\nexport const probe = other;\n`,
  [`${PROBE_A}/helpers.ts`]: `export const helper = 1;\n`,
  [`${PROBE_B}/helpers.ts`]: `export const probe = 1;\n`,
  [`${PROBE_B}/cycle-x.ts`]: `import { y } from './cycle-y.js';\nexport const x = () => y;\n`,
  [`${PROBE_B}/cycle-y.ts`]: `import { x } from './cycle-x.js';\nexport const y = () => x;\n`,
  [`${PROBE_ADAPTER}/probe.ts`]: `import { helper } from '../../modules/__onion_probe_a__/helpers.js';\nexport const probe = helper;\n`,
  // Negative probes — must produce NO violation.
  [`${PROBE_A}/ports.ts`]: `import type { Finding } from '@devdigest/shared';\nexport type Probe = Finding;\n`,
  [`${PROBE_A}/repository.ts`]: `import { sql } from 'drizzle-orm';\nimport * as t from '../../db/schema.js';\nexport const probe = [sql, t];\n`,
};

/** rule → probe file that must trigger it. */
const EXPECTED = {
  'domain-is-pure': `${PROBE_A}/domain.ts`,
  'domain-shared-type-only': `${PROBE_A}/domain/shared-runtime.ts`,
  'routes-no-data-access': `${PROBE_A}/routes.ts`,
  'routes-no-adapters': `${PROBE_B}/routes.ts`,
  'application-no-drizzle': `${PROBE_A}/service.ts`,
  'application-no-db-rows': `${PROBE_A}/rows-user.ts`,
  'application-no-adapters': `${PROBE_A}/adapter-user.ts`,
  'no-cross-module-imports': `${PROBE_A}/cross-module.ts`,
  'adapters-are-outer-ring': `${PROBE_ADAPTER}/probe.ts`,
  'no-circular': `${PROBE_B}/cycle-x.ts|${PROBE_B}/cycle-y.ts`,
};
const MUST_BE_CLEAN = [`${PROBE_A}/ports.ts`, `${PROBE_A}/repository.ts`, `${PROBE_A}/helpers.ts`, `${PROBE_B}/helpers.ts`];

function selfTest() {
  const probeDirs = [PROBE_A, PROBE_B, PROBE_ADAPTER].map((d) => join(SERVER_DIR, d));
  if (probeDirs.some(existsSync)) {
    console.error(`✖ probe folders already exist (${probeDirs.join(', ')}) — remove them first`);
    process.exit(2);
  }
  const cleanup = () => probeDirs.forEach((d) => rmSync(d, { recursive: true, force: true }));
  process.once('SIGINT', () => (cleanup(), process.exit(130)));

  const failures = [];
  try {
    for (const [file, content] of Object.entries(PROBE_FILES)) {
      const abs = join(SERVER_DIR, file);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
    const violations = cruise([PROBE_A, PROBE_B, PROBE_ADAPTER]);
    const fromProbe = violations.filter((v) => v.from.includes('__onion_probe'));

    // 1. every configured rule has a probe
    const rules = createRequire(import.meta.url)(CONFIG).forbidden.map((r) => r.name);
    for (const r of rules) if (!EXPECTED[r]) failures.push(`rule "${r}" has no probe in --self-test (add one)`);

    // 2. every probe triggers its rule
    for (const [rule, files] of Object.entries(EXPECTED)) {
      const candidates = files.split('|');
      const hit = fromProbe.some((v) => v.rule.name === rule && candidates.includes(v.from));
      console.log(`${hit ? '✔' : '✖'} ${rule.padEnd(26)} ← ${candidates.join(' ⇄ ')}`);
      if (!hit) failures.push(`rule "${rule}" did NOT fire on its probe — it is dead`);
    }

    // 3. negative probes stay clean, and positive probes trigger only their own rule
    for (const v of fromProbe) {
      if (MUST_BE_CLEAN.includes(v.from)) failures.push(`false positive: ${v.rule.name} on ${v.from} (must be allowed)`);
      const expectedFrom = EXPECTED[v.rule.name]?.split('|') ?? [];
      if (!MUST_BE_CLEAN.includes(v.from) && !expectedFrom.includes(v.from)) {
        failures.push(`unexpected: ${v.rule.name} on ${v.from} → ${normalizeTarget(v.to)}`);
      }
    }
  } finally {
    cleanup();
  }

  if (failures.length) {
    list('✖ self-test failed:', failures);
    process.exit(1);
  }
  console.log(`✔ self-test: all ${Object.keys(EXPECTED).length} rules fire, negative probes clean`);
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.includes('--self-test')) selfTest();

const update = args.includes('--update');
const baseIdx = args.indexOf('--base');
const baseFile = baseIdx >= 0 ? args[baseIdx + 1] : undefined;

const current = new Map(cruise().map((v) => [keyOf(v), v.rule.severity]));

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
