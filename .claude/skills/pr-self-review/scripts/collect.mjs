#!/usr/bin/env node
// Step 1 of pr-self-review: what changed, which lens reviews it, and the checks
// that need no judgement. Usage: node collect.mjs [--base <ref>] [--no-deps]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SKILL_DIR,
  git,
  isEnvFile,
  loadRouting,
  matchAny,
  readText,
  snapshot,
  statePaths,
  writeJson,
} from './lib.mjs';

const MIGRATIONS = ['server/src/db/migrations/*.sql'];
const SHARED_COPIES = ['server/src/vendor/shared/', 'client/src/vendor/shared/'];

// Real key formats only. A match is reported by name; the value is never printed.
const SECRET_PATTERNS = [
  ['an API key (sk-…)', /\bsk-(?:ant-|or-v1-|proj-)?[A-Za-z0-9_-]{32,}/],
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/],
  ['an AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['a Slack token', /\bxox[abprs]-[A-Za-z0-9-]{20,}/],
  ['a private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
];

/** Lines the branch added: `ranges` in the new file, plus the text for scanning. */
function addedLines(root, mergeBase, file) {
  if (file.status === 'D' || isEnvFile(file.path)) return { ranges: [], lines: [] };
  if (file.untracked) {
    const text = readText(root, file.path);
    if (text == null) return { ranges: [], lines: [] };
    const lines = text.split('\n').map((line, i) => ({ line: i + 1, text: line }));
    return { ranges: [[1, Math.max(1, lines.length)]], lines };
  }
  const diff = git(root, ['diff', '-U0', '--no-renames', '--no-color', mergeBase, '--', file.path]);
  const ranges = [];
  const lines = [];
  let next = 0;
  for (const row of diff.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(row);
    if (hunk) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      // A pure deletion has no added line: anchor it on the lines around the gap,
      // so removing a check can still be cited.
      ranges.push(count === 0 ? [Math.max(1, start), start + 1] : [start, start + count - 1]);
      next = start;
    } else if (row.startsWith('+') && !row.startsWith('+++')) {
      lines.push({ line: next++, text: row.slice(1) });
    }
  }
  return { ranges, lines };
}

function finding(rule, file, line, title, why, fix, extra = {}) {
  return { severity: 'CRITICAL', rule, file, line, title, why, fix, mechanical: true, ...extra };
}

function checkMigrations(files) {
  return files
    .filter((file) => !file.untracked && file.status !== 'A' && matchAny(file.path, MIGRATIONS))
    .map((file) =>
      finding(
        'repo/applied-migration-edited',
        file.path,
        1,
        `Applied migration ${file.status === 'D' ? 'deleted' : 'edited'}`,
        'A database that already ran this file will never see the change, so schemas drift apart.',
        'Restore the file, change server/src/db/schema/ and run `pnpm db:generate` for a new migration.',
      ),
    );
}

function checkSharedCopies(root, files) {
  const changed = new Set(files.map((file) => file.path));
  const out = [];
  for (const file of files) {
    const own = SHARED_COPIES.find((prefix) => file.path.startsWith(prefix));
    if (!own) continue;
    const other = SHARED_COPIES.find((prefix) => prefix !== own);
    const twin = other + file.path.slice(own.length);
    if (changed.has(twin)) continue;
    const mine = file.status === 'D' ? null : readText(root, file.path);
    const theirs = readText(root, twin);
    if (mine === theirs) continue;
    out.push(
      finding(
        'repo/shared-contract-one-copy',
        file.path,
        1,
        '@devdigest/shared changed in one copy only',
        `${twin} was not changed, so the server and the client now disagree on this contract.`,
        `Apply the same change to ${twin}.`,
      ),
    );
  }
  return out;
}

function checkSecrets(files, added) {
  const out = [];
  for (const file of files) {
    for (const { line, text } of added.get(file.path).lines) {
      const hit = SECRET_PATTERNS.find(([, re]) => re.test(text));
      if (!hit) continue;
      out.push(
        finding(
          'repo/secret-in-diff',
          file.path,
          line,
          `Looks like ${hit[0]} in an added line`,
          'A key in a commit stays in git history and must be treated as leaked.',
          'Remove it, rotate the key, and read it from the environment or ~/.devdigest/secrets.json.',
          { suppressible: true },
        ),
      );
    }
  }
  return out;
}

function checkEnvFiles(files) {
  return files
    .filter((file) => file.status !== 'D' && isEnvFile(file.path))
    .map((file) =>
      finding(
        'repo/env-file-in-diff',
        file.path,
        1,
        'A dotenv file is part of the change',
        'These files hold real keys and must not be committed.',
        'Remove it from the change and keep it git-ignored; commit an .env.example instead.',
      ),
    );
}

function checkClaudeSymlinks(root, files) {
  return files
    .filter((file) => file.status !== 'D' && path.basename(file.path) === 'CLAUDE.md')
    .filter((file) => !fs.lstatSync(path.join(root, file.path)).isSymbolicLink())
    .map((file) =>
      finding(
        'repo/claude-md-not-symlink',
        file.path,
        1,
        'CLAUDE.md is a regular file',
        'CLAUDE.md must stay a symlink to the AGENTS.md beside it; a copy goes stale.',
        'Edit AGENTS.md and restore the link: `ln -sf AGENTS.md CLAUDE.md`.',
      ),
    );
}

function defaultDepsRunner(root, config) {
  const [command, ...args] = config.command;
  try {
    execFileSync(command, args, {
      cwd: path.join(root, config.cwd),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, output: '' };
  } catch (err) {
    return { ok: false, output: `${err.stdout ?? ''}${err.stderr ?? ''}` || String(err.message) };
  }
}

function checkDeps(root, files, routing, problems, depsRunner) {
  const config = routing.depsValidate;
  const trigger = config && files.find((file) => matchAny(file.path, config.when));
  if (!trigger) return [];
  const label = config.command.join(' ');
  const result = depsRunner(root, config);
  if (result.ok) return [];
  const rows = result.output.trim().split('\n');
  const tail = rows.slice(-25).join('\n');
  if (!/violation/i.test(result.output)) {
    problems.push(`\`${label}\` could not run in ${config.cwd}/:\n${tail}`);
    return [];
  }
  return [
    finding(
      'onion/deps-validate',
      trigger.path,
      1,
      `\`${label}\` reports import-boundary violations`,
      rows.filter((row) => /^\s*(error|warn)\s|violation/i.test(row)).slice(0, 40).join('\n') || tail,
      'Fix the import direction (see the onion-architecture skill); do not edit .dependency-cruiser.cjs.',
    ),
  ];
}

const KEEP_STATE_MS = 14 * 24 * 60 * 60 * 1000;

/** Old manifests, verdicts and group results pile up in the git dir; drop the stale ones. */
function prune(dir, now = Date.now()) {
  if (!fs.existsSync(dir)) return;
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, dirent.name);
    if (dirent.isDirectory()) prune(file, now);
    else if (dirent.name !== 'last.json' && now - fs.statSync(file).mtimeMs > KEEP_STATE_MS) fs.rmSync(file);
  }
}

/** The snapshot plus added-line ranges and the mechanical checks; saved as the manifest. */
export function collect({ cwd, base, routing, skillDir = SKILL_DIR, runDeps = true, depsRunner } = {}) {
  routing ??= loadRouting(skillDir);
  const snap = snapshot({ cwd, base, routing, skillDir });
  const added = new Map(snap.files.map((file) => [file.path, addedLines(snap.root, snap.mergeBase, file)]));
  const problems = [...snap.problems];
  const mechanical = [
    ...checkMigrations(snap.files),
    ...checkSharedCopies(snap.root, snap.files),
    ...checkSecrets(snap.files, added),
    ...checkEnvFiles(snap.files),
    ...checkClaudeSymlinks(snap.root, snap.files),
    ...(runDeps ? checkDeps(snap.root, snap.files, routing, problems, depsRunner ?? defaultDepsRunner) : []),
  ];
  const manifest = {
    ...snap,
    problems,
    depsSkipped: !runDeps && Boolean(routing.depsValidate) && snap.files.some((file) => matchAny(file.path, routing.depsValidate.when)),
    files: snap.files.map((file) => ({ ...file, addedRanges: added.get(file.path).ranges })),
    mechanical,
    createdAt: new Date().toISOString(),
  };
  const paths = statePaths(snap.stateDir);
  prune(snap.stateDir);
  writeJson(paths.manifest(snap.key), manifest);
  writeJson(paths.last, { key: snap.key, base: snap.base });
  return manifest;
}

/** What the reviewing session needs to see; the full manifest stays on disk. */
export function summarize(manifest) {
  const paths = statePaths(manifest.stateDir);
  const untracked = new Set(manifest.files.filter((file) => file.untracked).map((file) => file.path));
  const quote = (file) => `'${file.replace(/'/g, `'\\''`)}'`;
  return {
    key: manifest.key,
    base: manifest.base,
    mergeBase: manifest.mergeBase,
    changedFiles: manifest.files.length,
    uncommitted: manifest.uncommitted,
    problems: manifest.problems,
    mechanical: manifest.mechanical,
    groups: manifest.groups.map((group) => {
      const trackedFiles = group.files.filter((file) => !untracked.has(file));
      return {
        id: group.id,
        cached: fs.existsSync(paths.group(group.key)),
        lenses: group.lenses.map((lens) => ({ lens: lens.name, read: lens.read, files: lens.files })),
        diffCommand: trackedFiles.length
          ? `git diff ${manifest.mergeBase.slice(0, 12)} -- ${trackedFiles.map(quote).join(' ')}`
          : null,
        newFiles: group.files.filter((file) => untracked.has(file)),
      };
    }),
    unroutedFiles: manifest.unroutedFiles,
    unroutedSkills: manifest.unroutedSkills,
  };
}

function main(argv) {
  const baseAt = argv.indexOf('--base');
  const manifest = collect({
    base: baseAt >= 0 ? argv[baseAt + 1] : undefined,
    runDeps: !argv.includes('--no-deps'),
  });
  process.stdout.write(`${JSON.stringify(summarize(manifest), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`pr-self-review collect: ${err.message}\n`);
    process.exit(1);
  }
}
