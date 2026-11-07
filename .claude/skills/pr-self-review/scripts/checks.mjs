#!/usr/bin/env node
/**
 * Deterministic checks (no LLM) for pr-self-review — run after collect-diff.mjs, in parallel with the
 * skill agents. Reads run/plan.json, writes run/checks.json.
 *
 *   node .claude/skills/pr-self-review/scripts/checks.mjs [--policy-only] [--skip-typecheck] [--skip-tests]
 *
 * 1. "Do not touch" policy (AGENTS.md)      → critical
 * 2. Onion layer check (dependency-cruiser) → critical per NEW error-level violation
 * 3. tsc --noEmit per changed package        → critical in changed files, high elsewhere
 * 4. reviewer-core changed → server unit tests (server type-checks against its source) → critical
 * Tools are called via `node <bin>` — on Windows `pnpm <script>` can fail ("Access is denied").
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { ROOT, RUN_DIR, SKILL_DIR, git, inRanges, matchesAny, readJson, writeJson } from './lib.mjs';

const args = process.argv.slice(2);
const policyOnly = args.includes('--policy-only');
const skipTypecheck = policyOnly || args.includes('--skip-typecheck');
const skipTests = policyOnly || args.includes('--skip-tests');

const plan = readJson(join(RUN_DIR, 'plan.json'));
if (!plan) {
  console.error('run/plan.json not found — run collect-diff.mjs first');
  process.exit(2);
}
const routing = readJson(join(SKILL_DIR, 'references', 'routing.json'));

const findings = [];
const warnings = [];
const ran = [];
const byPath = new Map(plan.files.map((f) => [f.path, f]));
const changed = plan.files.map((f) => f.path);
const changedAny = (globs) => changed.some((p) => matchesAny(p, globs));

const add = (f) =>
  findings.push({
    source: 'deterministic',
    severity: 'critical',
    line: null,
    onChangedLine: true,
    waivable: true,
    evidence: '',
    ...f,
  });

const run = (cmd, argv, cwd, timeout) => {
  try {
    return { code: 0, out: execFileSync(cmd, argv, { cwd, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}`, timedOut: e.signal === 'SIGTERM' };
  }
};

// ---------------------------------------------------------------------------------------------
// 1. Policy
// ---------------------------------------------------------------------------------------------
ran.push('policy');

// vendor/shared exists twice (server canonical + client copy). An edit stays NON-waivable unless the
// same file changed in BOTH copies and both are byte-identical afterwards (compared as git blobs, so
// working-tree CRLF from core.autocrlf doesn't count as a difference). Deleting either copy never qualifies.
const VENDOR_SHARED_ROOTS = ['server/src/vendor/shared/', 'client/src/vendor/shared/'];
const VENDOR_SHARED_GLOBS = VENDOR_SHARED_ROOTS.map((r) => `${r}**`);
function mirroredVendorChange(p) {
  const [own, otherRoot] = p.startsWith(VENDOR_SHARED_ROOTS[0]) ? VENDOR_SHARED_ROOTS : [...VENDOR_SHARED_ROOTS].reverse();
  const other = otherRoot + p.slice(own.length);
  const no = (why, evidence = '') => ({ ok: false, other, why, evidence });
  if (!byPath.has(other)) return no(`only one copy changed — ${other} is unchanged`);
  if (byPath.get(p).deleted || byPath.get(other).deleted || !existsSync(join(ROOT, p)) || !existsSync(join(ROOT, other))) {
    return no('a copy was deleted');
  }
  const [a, b] = git(['hash-object', '--', p, other]).trim().split(/\r?\n/);
  const evidence = `${p} ${a.slice(0, 12)} · ${other} ${b.slice(0, 12)}`;
  return a === b ? { ok: true, other, why: '', evidence } : no(`both copies changed but differ — ${other} is not byte-identical`, evidence);
}

for (const p of changed) {
  if (p.startsWith('server/clones/')) {
    add({ skill: 'policy', rule: 'policy/do-not-touch-clones', file: p, waivable: false,
      issue: 'server/clones/** are runtime git checkouts that contain the GitHub token in .git/config',
      fix: `git rm --cached -r "${p}" and keep clones/ ignored` });
  }
  if (matchesAny(p, VENDOR_SHARED_GLOBS)) {
    const mirror = mirroredVendorChange(p);
    add({ skill: 'policy', rule: 'policy/do-not-touch-vendor-shared', file: p, waivable: mirror.ok,
      issue: mirror.ok
        ? `vendor/shared contract changed in BOTH copies, byte-identical (${mirror.other}) — waivable only by the user after agreeing the contract change`
        : `Zod contracts in vendor/shared must not be edited without coordination (AGENTS.md → Do not touch); a change here can break @devdigest/shared consumers. Not waivable: ${mirror.why}`,
      evidence: mirror.evidence,
      fix: mirror.ok
        ? 'If the contract change is agreed, the user adds a waiver for this file (references/waivers.md); otherwise revert both copies'
        : `Revert (git checkout ${plan.mergeBase.slice(0, 8)} -- "${p}"), or make the SAME change in ${mirror.other} so both copies are byte-identical, and agree it with the user` });
  }
}

const schemaChanged = changedAny(['server/src/db/schema/**', 'server/src/db/schema.ts']);
for (const p of changed.filter((x) => x.startsWith('server/src/db/migrations/'))) {
  if (!schemaChanged) {
    add({ skill: 'policy', rule: 'policy/hand-edited-migration', file: p,
      issue: 'Migration changed but server/src/db/schema/** did not — migrations are generated, never hand-edited',
      fix: 'Revert the migration; change the Drizzle schema and run `node node_modules/drizzle-kit/bin.cjs generate` in server/' });
  }
}

for (const p of changed.filter((x) => /(^|\/)(pnpm-lock\.yaml|package-lock\.json)$/.test(x))) {
  const dir = posix.dirname(p);
  const manifest = dir === '.' ? 'package.json' : `${dir}/package.json`;
  if (!byPath.has(manifest)) {
    add({ skill: 'policy', rule: 'policy/lockfile-without-manifest', file: p,
      issue: `Lockfile changed but ${manifest} did not — lockfiles change only via the package manager`,
      fix: `Revert ${p} or make the intended dependency change in ${manifest} and reinstall` });
  }
}

for (const p of changed) {
  const m = /^\.claude\/skills\/([^/]+)\//.exec(p);
  if ((m && !routing.ownSkills.includes(m[1])) || p === 'skills-lock.json') {
    add({ skill: 'policy', rule: 'policy/vendored-skill-edited', file: p,
      issue: 'Vendored third-party skills (and skills-lock.json) are pinned by hash and must not be edited',
      fix: 'Revert the change, or update the skill through its upstream source and skills-lock.json together (needs a waiver)' });
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Onion layer check
// ---------------------------------------------------------------------------------------------
const serverDir = join(ROOT, 'server');
const archScript = join(serverDir, 'scripts', 'check-architecture.mjs');
if (!policyOnly && changedAny(['server/src/**', 'server/.dependency-cruiser.cjs', 'server/architecture-baseline.json', 'server/scripts/check-architecture.mjs'])) {
  if (!existsSync(archScript) || !existsSync(join(serverDir, 'node_modules', 'dependency-cruiser'))) {
    warnings.push('architecture check skipped: server/node_modules (dependency-cruiser) not installed');
  } else {
    ran.push('architecture');
    // Baseline as it was on the merge-base → catches `--update` used to absorb new violations.
    const tmp = mkdtempSync(join(tmpdir(), 'prsr-'));
    const baseBaseline = join(tmp, 'baseline.json');
    let baseArgs = [];
    try {
      writeFileSync(baseBaseline, git(['show', `${plan.mergeBase}:server/architecture-baseline.json`]));
      baseArgs = ['--base', baseBaseline];
    } catch { /* no baseline on base — growth check skipped */ }
    const r = run(process.execPath, [archScript, ...baseArgs], serverDir, 300_000);
    rmSync(tmp, { recursive: true, force: true });
    if (r.code !== 0) {
      const lines = r.out.split(/\r?\n/);
      let section = null;
      for (const line of lines) {
        if (line.startsWith('✖ NEW layer violations')) section = 'new';
        else if (line.startsWith('✖ architecture-baseline.json GREW')) section = 'grew';
        else if (!line.startsWith('  - ')) section = line.startsWith('  ') ? section : null;
        else if (section) {
          const key = line.slice(4).trim();
          const [rule, from, to] = key.split('|');
          const file = section === 'grew' ? 'server/architecture-baseline.json' : `server/${from}`;
          let lineNo = null;
          const abs = join(ROOT, file);
          if (section === 'new' && to && existsSync(abs)) {
            const needle = to.replace(/^node_modules\//, '').replace(/^src\//, '').replace(/\.(ts|js)$/, '');
            const tail = needle.split('/').slice(-2).join('/');
            const idx = readFileSync(abs, 'utf8').split('\n').findIndex((l) => /\b(import|from|require)\b/.test(l) && l.includes(tail));
            if (idx >= 0) lineNo = idx + 1;
          }
          add({
            skill: 'onion-architecture',
            rule: `onion/${rule}`,
            file,
            line: lineNo,
            waivable: section !== 'grew',
            issue: section === 'grew'
              ? `architecture-baseline.json grew vs base (${key}) — the baseline may only shrink`
              : `New layer violation: ${from} → ${to} (${rule})`,
            evidence: key,
            fix: section === 'grew'
              ? 'Fix the violation instead of absorbing it; restore the baseline from the base branch'
              : 'Move the dependency behind a port / into the right ring — see .claude/skills/onion-architecture/examples.md',
          });
        }
      }
      if (!findings.some((f) => f.skill === 'onion-architecture')) {
        warnings.push(`architecture check exited ${r.code} without parseable violations:\n${r.out.split('\n').slice(-15).join('\n')}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 3. Typecheck
// ---------------------------------------------------------------------------------------------
const TS_RELEVANT = ['**/*.{ts,tsx,mts,cts}', '**/tsconfig*.json', '**/package.json'];
const MAX_TS_FINDINGS = 50;
if (!skipTypecheck) {
  for (const pkg of ['server', 'client', 'reviewer-core', 'e2e']) {
    const touched = changed.filter((p) => p.startsWith(`${pkg}/`) && matchesAny(p, TS_RELEVANT));
    // server type-checks against reviewer-core source → a reviewer-core change also re-checks server
    const viaCore = pkg === 'server' && changed.some((p) => p.startsWith('reviewer-core/src/'));
    if (!touched.length && !viaCore) continue;
    const dir = join(ROOT, pkg);
    const tsc = join(dir, 'node_modules', 'typescript', 'bin', 'tsc');
    if (!existsSync(tsc)) {
      warnings.push(`typecheck skipped: ${pkg} (node_modules not installed)`);
      continue;
    }
    ran.push(`typecheck:${pkg}`);
    const r = run(process.execPath, [tsc, '--noEmit', '-p', 'tsconfig.json', '--pretty', 'false'], dir, 600_000);
    if (r.timedOut) {
      warnings.push(`typecheck timed out: ${pkg}`);
      continue;
    }
    let count = 0;
    for (const line of r.out.split(/\r?\n/)) {
      const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line);
      if (!m) continue;
      if (++count > MAX_TS_FINDINGS) continue;
      const file = posix.normalize(posix.join(pkg, m[1].replace(/\\/g, '/')));
      const f = byPath.get(file);
      const lineNo = Number(m[2]);
      add({
        skill: 'typecheck',
        rule: `typecheck/${m[4]}`,
        file,
        line: lineNo,
        severity: f ? 'critical' : 'high',
        onChangedLine: f ? true : false,
        possiblyCausedByChange: !f,
        issue: f ? m[5] : `${m[5]} — in an unchanged file: pre-existing, or caused by a changed export`,
        evidence: line.trim(),
        fix: 'Fix the type error (run the same tsc command in the package to iterate)',
      });
      if (f && !inRanges(lineNo, f.changedLines)) findings.at(-1).note = 'error is in a changed file but outside the changed lines';
    }
    if (count > MAX_TS_FINDINGS) warnings.push(`typecheck ${pkg}: ${count} errors, only the first ${MAX_TS_FINDINGS} reported`);
    if (r.code !== 0 && count === 0) warnings.push(`typecheck ${pkg} exited ${r.code} without parseable errors:\n${r.out.split('\n').slice(-10).join('\n')}`);
  }
}

// ---------------------------------------------------------------------------------------------
// 4. reviewer-core → server unit tests
// ---------------------------------------------------------------------------------------------
if (!skipTests && changed.some((p) => p.startsWith('reviewer-core/'))) {
  const vitest = join(serverDir, 'node_modules', 'vitest', 'vitest.mjs');
  if (!existsSync(vitest)) {
    warnings.push('server unit tests skipped: server/node_modules not installed');
  } else {
    ran.push('tests:server-unit');
    const r = run(process.execPath, [vitest, 'run', '--exclude', '**/*.it.test.ts'], serverDir, 600_000);
    if (r.code !== 0) {
      add({
        skill: 'tests',
        rule: 'tests/server-unit',
        file: 'server/test',
        issue: r.timedOut ? 'server unit tests timed out after a reviewer-core change' : 'server unit tests fail after a reviewer-core change (server type-checks and runs against reviewer-core source)',
        evidence: r.out.split(/\r?\n/).filter(Boolean).slice(-40).join('\n'),
        fix: 'cd server && node node_modules/vitest/vitest.mjs run --exclude "**/*.it.test.ts"',
      });
    }
  }
}

writeJson(join(RUN_DIR, 'checks.json'), { ran, findings, warnings });
console.log(`checks ran: ${ran.join(', ') || 'none'} · findings: ${findings.length} (critical ${findings.filter((f) => f.severity === 'critical').length})`);
for (const f of findings) console.log(`  ${f.severity.toUpperCase()} ${f.file}${f.line ? `:${f.line}` : ''} · ${f.rule} · ${f.issue.split('\n')[0]}`);
for (const w of warnings) console.log(`WARN ${w}`);
