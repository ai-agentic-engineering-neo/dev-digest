#!/usr/bin/env node
// pr-self-review — step 3: deterministic gates for the packages the diff touches + cheap repo rules.
// No dependencies, no LLM. Every failure becomes a finding with the product severity enum
// (CRITICAL / WARNING / SUGGESTION) so verdict.mjs can merge it with the LLM findings.
//
// Exit codes: 0 no CRITICAL · 3 at least one CRITICAL · 4 no CRITICAL but a gate could not run
// (e.g. dependencies not installed) · 1 usage/git error · 2 skill-map completeness error.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collect, loadMap, DEFAULT_MAP, matchesAny, parseAddedLines, runDir } from './collect.mjs';

const OUTPUT_TAIL = 6000;
const COMMAND_TIMEOUT_MS = 15 * 60 * 1000;

// ---------- package gates ----------

const PNPM = ['npx', '-y', 'pnpm@10']; // pnpm ≥11 ignores package.json "pnpm" overrides (client/INSIGHTS.md)

/**
 * Which gates run for which package. `triggers`: changed paths that make the package's gates run
 * (docs-only changes do not). Keep in sync with the `paths:` of .github/workflows/{client,
 * server-unit,reviewer-core}.yml — ci.mjs uses the same table to decide which suites CI calls.
 */
export const PACKAGE_GATES = {
  client: {
    triggers: ['client/**', 'server/src/vendor/shared/**', 'scripts/check-contracts.sh', '.github/workflows/client.yml'],
    commands: [
      { name: 'lint', argv: [...PNPM, 'exec', 'eslint', '.'] },
      { name: 'typecheck', argv: [...PNPM, 'run', 'typecheck'] },
      { name: 'test', argv: [...PNPM, 'run', 'test'] },
    ],
  },
  server: {
    // reviewer-core/** triggers server-unit in CI (server type-checks its sources)
    triggers: ['server/**', 'reviewer-core/**', '.github/workflows/server-unit.yml'],
    commands: [
      { name: 'lint', argv: [...PNPM, 'exec', 'eslint', '.'] },
      { name: 'typecheck', argv: [...PNPM, 'run', 'typecheck'] },
      // unit lane incl. test/architecture.test.ts (depcruise); integration needs Docker → --integration
      { name: 'test', argv: [...PNPM, 'exec', 'vitest', 'run', '--exclude', '**/*.it.test.ts'] },
      { name: 'test:integration', argv: [...PNPM, 'exec', 'vitest', 'run', '.it.test'], optIn: 'integration' },
    ],
  },
  'reviewer-core': {
    // reviewer-core aliases @devdigest/shared to server/src/vendor/shared
    triggers: ['reviewer-core/**', 'server/src/vendor/shared/**', '.github/workflows/reviewer-core.yml'],
    commands: [
      { name: 'lint', argv: ['npm', 'run', 'lint'] },
      { name: 'typecheck', argv: ['npm', 'run', 'typecheck'] },
      { name: 'test', argv: ['npm', 'test'] },
    ],
  },
  e2e: {
    // the flows need the whole stack; only the typecheck is a cheap local gate
    triggers: ['e2e/**'],
    commands: [{ name: 'typecheck', argv: ['npm', 'run', 'typecheck'] }],
  },
};

const NON_CODE = ['**/*.md', '**/INSIGHTS*.md'];

/** Packages whose gates must run for this plan, in a stable order. */
export function packagesToGate(plan, gates = PACKAGE_GATES) {
  const changed = plan.files.filter((f) => !matchesAny(f.path, NON_CODE)).map((f) => f.path);
  return Object.entries(gates)
    .filter(([, g]) => changed.some((p) => matchesAny(p, g.triggers)))
    .map(([name]) => name);
}

const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
const tail = (s, n = OUTPUT_TAIL) => (s.length > n ? `…${s.slice(-n)}` : s);

export function defaultExec(argv, cwd) {
  const started = Date.now();
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: COMMAND_TIMEOUT_MS,
    env: { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  return {
    code: r.error ? null : r.status,
    error: r.error ? String(r.error.message || r.error) : (r.signal ? `killed by ${r.signal}` : null),
    output: stripAnsi(`${r.stdout ?? ''}${r.stderr ?? ''}`),
    durationMs: Date.now() - started,
  };
}

function runPackageGates({ repo, pkg, gate, exec, options, stop }) {
  const results = [];
  const findings = [];
  const cwd = path.join(repo, pkg);
  for (const cmd of gate.commands) {
    const base = { kind: 'command', package: pkg, name: cmd.name, command: cmd.argv.join(' ') };
    if (cmd.optIn && !options[cmd.optIn]) { results.push({ ...base, status: 'skipped', reason: `opt-in: --${cmd.optIn}` }); continue; }
    if (!fs.existsSync(path.join(cwd, 'node_modules'))) {
      results.push({ ...base, status: 'error', reason: `${pkg}/node_modules is missing — install dependencies first` });
      continue;
    }
    if (stop(findings)) { results.push({ ...base, status: 'skipped', reason: 'fail-fast' }); continue; }
    const r = exec(cmd.argv, cwd);
    if (r.code === 0) { results.push({ ...base, status: 'pass', durationMs: r.durationMs }); continue; }
    if (r.code === null) {
      results.push({ ...base, status: 'error', reason: r.error, durationMs: r.durationMs, output: tail(r.output) });
      continue;
    }
    results.push({ ...base, status: 'fail', exitCode: r.code, durationMs: r.durationMs, output: tail(r.output) });
    findings.push({
      severity: 'CRITICAL',
      rule: `gate/${cmd.name}`,
      package: pkg,
      title: `${pkg}: \`${cmd.name}\` fails`,
      evidence: tail(r.output, 3000),
      fix: `Run \`cd ${pkg} && ${cmd.argv.join(' ')}\` and fix the errors.`,
    });
  }
  return { results, findings };
}

// ---------- repo rules ----------

const SHARED_DIRS = ['server/src/vendor/shared', 'client/src/vendor/shared'];

function listFiles(dir, root = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const abs = path.join(dir, d.name);
    return d.isDirectory() ? listFiles(abs, root) : [path.relative(root, abs).split(path.sep).join('/')];
  });
}

/** Both vendored copies of the Zod contracts must be identical (CLAUDE.md; scripts/check-contracts.sh). */
export function ruleContractDrift({ repo }) {
  const [a, b] = SHARED_DIRS.map((d) => path.join(repo, d));
  if (!fs.existsSync(a) && !fs.existsSync(b)) return [];
  const fa = new Set(listFiles(a));
  const fb = new Set(listFiles(b));
  const differ = [...new Set([...fa, ...fb])].sort().filter((f) => {
    if (!fa.has(f) || !fb.has(f)) return true;
    return !fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f)));
  });
  if (!differ.length) return [];
  return [{
    severity: 'CRITICAL',
    rule: 'repo/contract-drift',
    file: `${SHARED_DIRS[1]}/${differ[0]}`,
    title: `Vendored contracts differ between server and client (${differ.length} file(s))`,
    evidence: differ.map((f) => `${f}${!fa.has(f) ? ' (only in client)' : !fb.has(f) ? ' (only in server)' : ''}`).join('\n'),
    fix: 'Change the contract in server/src/vendor/shared, then `cp -R server/src/vendor/shared/. client/src/vendor/shared/` (scripts/check-contracts.sh).',
  }];
}

const PACKAGE_MANAGER = { client: 'pnpm', server: 'pnpm', 'reviewer-core': 'npm', e2e: 'npm' };
const LOCKFILE = { pnpm: 'pnpm-lock.yaml', npm: 'package-lock.json' };

/** pnpm in client/ + server/, npm in reviewer-core/ + e2e/ — never the other lockfile, never yarn. */
export function rulePackageManagerMix({ plan }) {
  const findings = [];
  for (const f of plan.files) {
    if (f.status === 'D') continue;
    const name = path.posix.basename(f.path);
    const pm = PACKAGE_MANAGER[f.package];
    const wrong = name === 'yarn.lock'
      || (pm && name === LOCKFILE[pm === 'pnpm' ? 'npm' : 'pnpm'] && path.posix.dirname(f.path) === f.package);
    if (wrong) {
      findings.push({
        severity: 'CRITICAL',
        rule: 'repo/package-manager-mix',
        file: f.path,
        title: `${f.path}: wrong lockfile — ${f.package} uses ${pm ?? 'no package manager here'}`,
        evidence: `${f.path} is ${f.status === 'untracked' ? 'new (untracked)' : 'changed'}`,
        fix: `Delete ${f.path} and install with ${pm ?? 'the package manager of that package'} (root CLAUDE.md: "Don't mix them").`,
      });
    }
  }
  return findings;
}

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'overrides', 'pnpm', 'resolutions'];

function depsOf(json) {
  return JSON.stringify(Object.fromEntries(DEP_FIELDS.map((k) => [k, json?.[k] ?? null])));
}

/** A dependency change in package.json must come with its lockfile change. */
export function ruleLockfileSync({ plan, repo }) {
  const findings = [];
  const changed = new Set(plan.files.map((f) => f.path));
  for (const f of plan.files) {
    if (f.status === 'D' || path.posix.basename(f.path) !== 'package.json') continue;
    const pm = PACKAGE_MANAGER[f.package];
    if (!pm || path.posix.dirname(f.path) !== f.package) continue;
    const lock = `${f.package}/${LOCKFILE[pm]}`;
    if (changed.has(lock)) continue;
    let before = null;
    try {
      before = JSON.parse(execFileSync('git', ['-C', repo, 'show', `${plan.mergeBase}:${f.path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    } catch { /* new file */ }
    let after;
    try { after = JSON.parse(fs.readFileSync(path.join(repo, f.path), 'utf8')); } catch { continue; }
    if (before && depsOf(before) === depsOf(after)) continue; // scripts-only change
    findings.push({
      severity: 'WARNING',
      rule: 'repo/lockfile-sync',
      file: f.path,
      title: `${f.path}: dependencies changed but ${lock} did not`,
      evidence: `changed fields among: ${DEP_FIELDS.filter((k) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null)).join(', ')}`,
      fix: pm === 'pnpm'
        ? `cd ${f.package} && npx -y pnpm@10 install, then commit ${LOCKFILE.pnpm}.`
        : `cd ${f.package} && npm install, then commit ${LOCKFILE.npm}.`,
    });
  }
  return findings;
}

const SECRET_PATTERNS = [
  ['private key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenRouter API key', /\bsk-or-v1-[A-Za-z0-9]{20,}/],
  ['OpenAI API key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
];
// value: 16+ chars without spaces, with at least one letter AND one digit (skips 'repo/secret-like' style identifiers)
const GENERIC_SECRET = /\b(?:api[_-]?key|secret|token|passw(?:or)?d)\b["']?\s*[:=]\s*["'](?=[^"'\s]*\d)(?=[^"'\s]*[A-Za-z])[^"'\s]{16,}["']/i;
const SECRET_FILES = ['**/.env', '**/.env.*', '**/secrets.json', '**/*.pem', '**/id_rsa', '**/id_ed25519'];
const SECRET_FILE_ALLOW = ['**/.env.example', '**/.env.sample', '**/.env.template'];
const ALLOW_MARKER = 'pr-self-review: allow-secret';

/** Real-looking credentials in added lines, or secret files in the diff. */
export function ruleSecrets({ plan }) {
  const findings = [];
  for (const f of plan.files) {
    if (f.status === 'D') continue;
    if (matchesAny(f.path, SECRET_FILES) && !matchesAny(f.path, SECRET_FILE_ALLOW)) {
      findings.push({
        severity: 'CRITICAL',
        rule: 'repo/secret-file',
        file: f.path,
        title: `${f.path}: a secrets file is part of the change`,
        evidence: `${f.path} (${f.status})`,
        fix: 'Remove it from the change; secrets live in ~/.devdigest/secrets.json, never in git (root CLAUDE.md).',
      });
      continue;
    }
    if (f.binary || !f.diff) continue;
    for (const { line, text } of parseAddedLines(f.diff)) {
      if (text.includes(ALLOW_MARKER)) continue;
      const hit = SECRET_PATTERNS.find(([, re]) => re.test(text));
      const generic = !hit && GENERIC_SECRET.test(text);
      if (!hit && !generic) continue;
      findings.push({
        severity: hit ? 'CRITICAL' : 'WARNING',
        rule: hit ? 'repo/secret' : 'repo/secret-like',
        file: f.path,
        line,
        title: `${f.path}:${line}: ${hit ? `looks like a ${hit[0]}` : 'hard-coded credential-like value'}`,
        evidence: redact(text.trim()),
        fix: `Load it from the secrets store instead. A test fixture that must keep a fake value: add the comment "${ALLOW_MARKER}" on that line.`,
      });
    }
  }
  return findings;
}

function redact(s) {
  return s.replace(/([A-Za-z0-9_\-+/]{6})[A-Za-z0-9_\-+/]{10,}/g, '$1…').slice(0, 200);
}

const CYRILLIC = /[Ѐ-ӿ]/;
// skills keep non-English trigger phrases on purpose; i18n message catalogs are per-locale
const LANGUAGE_EXEMPT = ['.claude/skills/**', 'client/messages/**', '**/*.json'];
const COMMENT = /(?:^\s*(?:\/\/|\/\*|\*|#|<!--))|(?:\s\/\/\s)|(?:\/\*)/;

/** All docs and code comments are English (root CLAUDE.md). One finding per file. */
export function ruleEnglishOnly({ plan }) {
  const findings = [];
  for (const f of plan.files) {
    if (f.status === 'D' || f.binary || !f.diff || matchesAny(f.path, LANGUAGE_EXEMPT)) continue;
    const isDoc = /\.(md|mdx|txt)$/.test(f.path);
    const hits = parseAddedLines(f.diff).filter(({ text }) => CYRILLIC.test(text) && (isDoc || COMMENT.test(text)));
    if (!hits.length) continue;
    findings.push({
      severity: 'WARNING',
      rule: 'repo/english-only',
      file: f.path,
      line: hits[0].line,
      title: `${f.path}: non-English text in ${isDoc ? 'documentation' : 'code comments'} (${hits.length} line(s))`,
      evidence: hits.slice(0, 3).map((h) => `${h.line}: ${h.text.trim().slice(0, 120)}`).join('\n'),
      fix: 'Write documentation and comments in English (root CLAUDE.md).',
    });
  }
  return findings;
}

export const RULES = [ruleContractDrift, rulePackageManagerMix, ruleLockfileSync, ruleSecrets, ruleEnglishOnly];

// ---------- orchestration ----------

export function runChecks({ plan, gates = PACKAGE_GATES, exec = defaultExec, options = {}, failFast = false, skipGates = false }) {
  const repo = plan.repo;
  const results = [];
  let findings = [];

  for (const rule of RULES) {
    const name = `rule/${rule.name.replace(/^rule/, '').replace(/[A-Z]/g, (c, i) => `${i ? '-' : ''}${c.toLowerCase()}`)}`;
    try {
      const found = rule({ plan, repo });
      results.push({ kind: 'rule', name, status: found.some((x) => x.severity === 'CRITICAL') ? 'fail' : found.length ? 'warn' : 'pass', findings: found.length });
      findings.push(...found);
    } catch (e) {
      results.push({ kind: 'rule', name, status: 'error', reason: String(e.message || e) });
    }
  }

  const packages = plan.empty || skipGates ? [] : packagesToGate(plan, gates);
  for (const pkg of packages) {
    const stop = (local) => failFast && [...findings, ...local].some((x) => x.severity === 'CRITICAL');
    const r = runPackageGates({ repo, pkg, gate: gates[pkg], exec, options, stop });
    results.push(...r.results);
    findings.push(...r.findings);
  }

  findings = findings.map((f, i) => ({ id: `checks-${i + 1}`, source: 'checks', ...f }));
  const counts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) counts[f.severity]++;
  const incomplete = results.some((r) => r.status === 'error');
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    diffHash: plan.diffHash,
    head: plan.head,
    packagesGated: packages,
    status: counts.CRITICAL ? 'fail' : incomplete ? 'incomplete' : 'pass',
    counts,
    results,
    findings,
  };
}

export function formatChecks(report, outPath) {
  const icon = { pass: 'ok  ', fail: 'FAIL', warn: 'warn', error: 'ERR ', skipped: 'skip' };
  const lines = [`pr-self-review checks · diff ${report.diffHash.slice(0, 16)} · gated packages: ${report.packagesGated.join(', ') || '—'}`];
  for (const r of report.results) {
    const label = r.kind === 'command' ? `${r.package}: ${r.name}` : r.name;
    const extra = r.reason ? ` — ${r.reason}` : r.durationMs != null ? ` (${(r.durationMs / 1000).toFixed(1)}s)` : '';
    lines.push(`  [${icon[r.status] ?? r.status}] ${label}${extra}`);
  }
  for (const f of report.findings) lines.push(`  ${f.severity.padEnd(10)} ${f.title}`);
  lines.push(`Status: ${report.status.toUpperCase()} · CRITICAL ${report.counts.CRITICAL} · WARNING ${report.counts.WARNING} · SUGGESTION ${report.counts.SUGGESTION}`);
  if (outPath) lines.push(`Report written to ${outPath}`);
  return lines.join('\n');
}

function usage() {
  return `Usage: node checks.mjs [options]
  --plan <file>       reuse a plan.json from collect.mjs (default: run collect now)
  --base <ref>        base branch for collect (default origin/main)
  --no-fetch          do not git fetch the base
  --repo <dir>        repository (default: current directory)
  --integration       also run server integration tests (needs Docker)
  --fail-fast         skip remaining package gates after the first CRITICAL
  --rules-only        only the repo rules, no lint/typecheck/test
  --skills-dir <dir>  skills directory for collect's completeness check
  --out <file>        default: <run dir of the plan>/checks.json
  --stdout            print the JSON report instead of writing it`;
}

async function main() {
  const o = { base: 'origin/main', fetch: true, repo: process.cwd() };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) { console.error(`${a} needs a value\n${usage()}`); process.exit(1); } return argv[++i]; };
    if (a === '--plan') o.plan = next();
    else if (a === '--base') o.base = next();
    else if (a === '--no-fetch') o.fetch = false;
    else if (a === '--repo') o.repo = next();
    else if (a === '--integration') o.integration = true;
    else if (a === '--fail-fast') o.failFast = true;
    else if (a === '--rules-only') o.rulesOnly = true;
    else if (a === '--out') o.out = next();
    else if (a === '--skills-dir') o.skillsDir = next();
    else if (a === '--stdout') o.stdout = true;
    else if (a === '-h' || a === '--help') { console.log(usage()); return; }
    else { console.error(`unknown argument ${a}\n${usage()}`); process.exit(1); }
  }
  let plan;
  try {
    plan = o.plan
      ? JSON.parse(fs.readFileSync(o.plan, 'utf8'))
      : collect({ repo: o.repo, base: o.base, fetch: o.fetch, map: loadMap(DEFAULT_MAP), skillsDir: o.skillsDir });
  } catch (e) {
    console.error(`pr-self-review checks: ${e.message}`);
    process.exit(e.code === 'INCOMPLETE_MAP' ? 2 : 1);
  }
  const report = runChecks({ plan, options: { integration: !!o.integration }, failFast: !!o.failFast, skipGates: !!o.rulesOnly });
  if (o.stdout) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    const out = path.resolve(o.out ?? path.join(runDir(plan.repo, plan.diffHash), 'checks.json'));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(formatChecks(report, out));
  }
  process.exit(report.status === 'fail' ? 3 : report.status === 'incomplete' ? 4 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
