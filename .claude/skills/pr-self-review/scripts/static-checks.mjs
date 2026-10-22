#!/usr/bin/env node
// Step 2: deterministic checks — cheap, no LLM, no false-positive guessing.
// Grep rules look only at ADDED lines, so legacy code never blocks a PR.
// Usage: node static-checks.mjs [--no-typecheck] [--tests]   (reads run/plan.json from collect.mjs)
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, RUN_DIR, matchesGlob, parseArgs, readJson, readRepoFile, showAt, writeJson } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const plan = readJson(join(RUN_DIR, 'plan.json'));
if (!plan) {
  console.error('run/plan.json missing — run collect.mjs first.');
  process.exit(1);
}
const runTests = args.tests === true || plan.mode === 'full';
const findings = [];
const add = (f) => findings.push({ source: 'static', skill: 'static', confidence: 1, introduced: true, ...f });

// ---------- line rules (added lines only) ----------
const SDK = String.raw`fastify|drizzle-orm|octokit|@octokit\/[\w-]+|openai|@anthropic-ai\/sdk|simple-git|@ast-grep\/napi|node:fs|fs|fs\/promises`;
const importFrom = (mod) => new RegExp(String.raw`(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](?:${mod})['"]`);

const LINE_RULES = [
  {
    rule: 'static/route-db-access',
    severity: 'critical',
    files: ['server/src/modules/**/routes.ts', 'server/src/modules/**/routes/**/*.ts'],
    test: (l) => importFrom(String.raw`drizzle-orm[\w/-]*|[./]+(?:[\w-]+\/)*db\/schema[\w/-]*|[./]+(?:[\w-]+\/)*repository[\w/.-]*`).test(l) || /\bcontainer\.db\b/.test(l),
    summary: 'Route reaches the database directly (Drizzle / schema / repository / container.db).',
    fix: 'Move the query into the module repository and call it through a service method (onion-architecture).',
  },
  {
    rule: 'static/service-infra-import',
    severity: 'critical',
    files: ['server/src/modules/**/service.ts', 'server/src/modules/**/*.service.ts', 'server/src/modules/**/helpers.ts'],
    test: (l) => importFrom(`${SDK}|[./]+(?:[\\w-]+/)*db/schema[\\w/-]*`).test(l),
    summary: 'Application/domain code imports a framework, Drizzle or an SDK.',
    fix: 'Depend on a port from @devdigest/shared resolved via the container; keep Drizzle in the repository.',
  },
  {
    rule: 'static/reviewer-core-io',
    severity: 'critical',
    files: ['reviewer-core/src/**/*.ts'],
    exclude: ['**/*.test.ts'],
    test: (l) =>
      importFrom(String.raw`node:fs|fs|fs\/promises|node:child_process|child_process|pg|postgres|drizzle-orm[\w/-]*|octokit|@octokit\/[\w-]+|simple-git|[./]+(?:[\w-]+\/)*server\/src\/(?:db|adapters|platform|modules)[\w/.-]*`).test(l),
    summary: 'reviewer-core gains DB / GitHub / filesystem / process access — it must stay pure.',
    fix: 'Pass the data in from the server caller; the only side effect allowed is the injected LLMProvider.',
  },
  {
    rule: 'static/env-in-module',
    severity: 'major',
    files: ['server/src/modules/**/*.ts'],
    exclude: ['**/*.test.ts'],
    test: (l) => /\bprocess\.env\b/.test(l),
    summary: 'process.env read inside a feature module.',
    fix: 'Read config via container.config (platform/config.ts) or secrets via container.secrets.',
  },
  {
    rule: 'static/cross-module-reach-in',
    severity: 'major',
    files: ['server/src/modules/**/*.ts'],
    exclude: ['**/*.test.ts'],
    test: (l) => /from\s+['"]\.\.\/[\w-]+\/(?:repository|service)(?:\.ts)?['"]/.test(l),
    summary: "Imports another module's repository/service internals.",
    fix: 'Go through a shared repository or facade on the container.',
  },
  {
    rule: 'static/client-direct-fetch',
    severity: 'major',
    files: ['client/src/**/*.{ts,tsx}'],
    exclude: ['client/src/lib/api.ts', 'client/src/test/**', 'client/src/vendor/**', '**/*.test.{ts,tsx}'],
    test: (l) => /(?<![\w.])fetch\s*\(/.test(l),
    summary: 'Client code calls fetch directly.',
    fix: 'All HTTP goes through src/lib/api.ts and data access through hooks in src/lib/hooks/*.',
  },
  {
    rule: 'static/hardcoded-secret',
    severity: 'critical',
    files: ['**'],
    exclude: ['**/pnpm-lock.yaml', '**/package-lock.json', '**/*.test.{ts,tsx}', '**/test/**', '**/mocks.ts'],
    test: (l) =>
      /\b(?:sk-(?:ant-|or-|proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/.test(l) ||
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(l),
    summary: 'Looks like a hard-coded credential.',
    fix: 'Remove it, rotate the key, and read it via SecretsProvider / env.',
  },
];

for (const f of plan.files) {
  if (f.status === 'D' || f.added.length === 0) continue;
  const rules = LINE_RULES.filter((r) => matchesGlob(f.path, r.files) && !matchesGlob(f.path, r.exclude));
  if (!rules.length) continue;
  const text = readRepoFile(f.path);
  if (text === null || text.includes('\0')) continue;
  const lines = text.split('\n');
  for (const [s, e] of f.added) {
    for (let n = s; n <= e; n++) {
      const l = lines[n - 1] ?? '';
      for (const r of rules) {
        if (r.test(l)) {
          add({ rule: r.rule, severity: r.severity, file: f.path, line: n, summary: r.summary, fix: r.fix, evidence: l.trim().slice(0, 200) });
        }
      }
    }
  }
}

// ---------- do-not-touch paths ----------
for (const f of plan.files) {
  if (/^server\/src\/db\/migrations\/[^/]+\.sql$/.test(f.from ?? f.path) && ['M', 'D', 'R'].includes(f.status)) {
    add({
      rule: 'static/migration-edited',
      severity: 'critical',
      file: f.path,
      line: f.added[0]?.[0] ?? 1,
      summary: `Existing migration ${f.status === 'D' ? 'deleted' : 'edited'} — applied migrations must never change.`,
      fix: 'Revert it and generate a new migration with `pnpm db:generate`.',
      evidence: `${f.status} ${f.from ?? f.path}`,
    });
  }
}

// ---------- shared contract drift (server ↔ client copies) ----------
const SERVER_SHARED = 'server/src/vendor/shared/';
const CLIENT_SHARED = 'client/src/vendor/shared/';
const seen = new Set();
for (const f of plan.files) {
  const isServer = f.path.startsWith(SERVER_SHARED);
  const isClient = f.path.startsWith(CLIENT_SHARED);
  if (!isServer && !isClient) continue;
  const rel = f.path.slice((isServer ? SERVER_SHARED : CLIENT_SHARED).length);
  if (seen.has(rel)) continue;
  seen.add(rel);
  const serverPath = SERVER_SHARED + rel;
  const clientPath = CLIENT_SHARED + rel;
  const nowServer = readRepoFile(serverPath);
  const nowClient = readRepoFile(clientPath);
  if (nowServer === nowClient) continue;
  const wasEqual = showAt(plan.mergeBase, serverPath) === showAt(plan.mergeBase, clientPath);
  add({
    rule: 'static/shared-contract-drift',
    severity: wasEqual ? 'critical' : 'major',
    file: f.path,
    line: f.added[0]?.[0] ?? 1,
    summary: wasEqual
      ? `Shared contract copies diverged in this change: ${serverPath} ≠ ${clientPath}.`
      : `Changed a contract that already differed between server and client copies (${rel}); verify the change is mirrored.`,
    fix: 'Make the same change in both vendor/shared copies (server is the source of truth).',
    evidence: `${nowServer === null ? 'missing' : 'present'} on server, ${nowClient === null ? 'missing' : 'present'} on client`,
  });
}

// ---------- typecheck / tests per touched package ----------
const touched = (prefix) => plan.files.some((f) => !f.ignored && f.path.startsWith(prefix) && /\.(tsx?|json)$/.test(f.path));
const pkgs = new Set();
if (touched('client/')) pkgs.add('client');
if (touched('server/') || touched('reviewer-core/')) pkgs.add('server');
if (touched('reviewer-core/') || touched(SERVER_SHARED)) pkgs.add('reviewer-core');

const run = (cwd, bin, binArgs) =>
  new Promise((resolve) => {
    const exe = join(REPO_ROOT, cwd, 'node_modules/.bin', bin);
    if (!existsSync(exe)) return resolve({ skipped: `${cwd}/node_modules/.bin/${bin} not found (deps not installed)` });
    const p = spawn(exe, binArgs, { cwd: join(REPO_ROOT, cwd), env: { ...process.env, CI: '1', FORCE_COLOR: '0' } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });

const changedPaths = new Set(plan.files.map((f) => f.path));
const notes = [];
const jobs = [];
if (!args['no-typecheck']) {
  for (const pkg of pkgs) {
    jobs.push(
      run(pkg, 'tsc', ['--noEmit', '-p', 'tsconfig.json']).then((r) => {
        if (r.skipped) return notes.push(`typecheck ${pkg}: skipped — ${r.skipped}`);
        if (r.code === 0) return notes.push(`typecheck ${pkg}: ok`);
        const errors = [...r.out.matchAll(/^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/gm)];
        notes.push(`typecheck ${pkg}: ${errors.length || 'unparsed'} error(s)`);
        if (!errors.length) {
          add({ rule: 'static/typecheck', severity: 'critical', file: pkg, line: 0, summary: `tsc failed in ${pkg}.`, fix: 'Run the package typecheck and fix the errors.', evidence: r.out.slice(0, 400) });
        }
        for (const [, file, line, code, msg] of errors.slice(0, 30)) {
          const rel = join(pkg, file).replace(/\\/g, '/');
          const inDiff = changedPaths.has(rel);
          add({
            rule: 'static/typecheck',
            // Errors in untouched files may be pre-existing — reported, but they don't block.
            severity: inDiff ? 'critical' : 'major',
            introduced: inDiff,
            file: rel,
            line: Number(line),
            summary: `${code}: ${msg}`,
            fix: 'Fix the type error.',
            evidence: `${rel}(${line}) ${code}`,
          });
        }
      }),
    );
  }
}
if (runTests) {
  const TEST_ARGS = { client: ['run'], server: ['run', '--exclude', '**/*.it.test.ts'], 'reviewer-core': ['run', '--passWithNoTests'] };
  for (const pkg of pkgs) {
    jobs.push(
      run(pkg, 'vitest', TEST_ARGS[pkg]).then((r) => {
        if (r.skipped) return notes.push(`tests ${pkg}: skipped — ${r.skipped}`);
        notes.push(`tests ${pkg}: ${r.code === 0 ? 'ok' : 'FAILED'}`);
        if (r.code !== 0) {
          const failed = [...r.out.matchAll(/^\s*(?:FAIL|×|✗)\s+(\S+)/gm)].map((m) => m[1]);
          add({
            rule: 'static/tests',
            severity: 'critical',
            file: failed[0] ? join(pkg, failed[0]).replace(/\\/g, '/') : pkg,
            line: 0,
            summary: `Unit tests fail in ${pkg}${failed.length ? `: ${[...new Set(failed)].slice(0, 5).join(', ')}` : ''}.`,
            fix: `Run the ${pkg} tests and fix the failures.`,
            evidence: r.out.split('\n').filter((l) => /FAIL|AssertionError|Error:/.test(l)).slice(0, 8).join('\n').slice(0, 600),
          });
        }
      }),
    );
  }
}
await Promise.all(jobs);

writeJson(join(RUN_DIR, 'static.json'), { notes, findings });
const bySev = (s) => findings.filter((f) => f.severity === s && f.introduced).length;
console.log(`static checks: ${bySev('critical')} critical, ${bySev('major')} major (introduced)`);
for (const n of notes) console.log(`  ${n}`);
for (const f of findings.filter((x) => x.severity === 'critical'))
  console.log(`  CRITICAL ${f.rule} ${f.file}:${f.line} — ${f.summary}`);
