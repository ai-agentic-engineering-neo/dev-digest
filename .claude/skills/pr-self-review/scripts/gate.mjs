#!/usr/bin/env node
/**
 * Merge-gate for pr-self-review. Allows push / PR create / PR merge only when the last review is PASS
 * and was made for exactly the current diff.
 *
 *   node gate.mjs                 # manual: print gate status (exit 0 open, 1 closed)
 *   node gate.mjs --claude-hook   # Claude Code PreToolUse hook (Bash|PowerShell); stdin = hook JSON;
 *                                 # exit 2 + stderr blocks the tool call
 *   node gate.mjs --git-hook      # git pre-push hook; stdin = "<lref> <lsha> <rref> <rsha>" lines
 *
 * Bypass for a human is `git push --no-verify` (deliberate). There is no env-var bypass on purpose.
 */
import { readFileSync } from 'node:fs';
import { LAST_RUN_FILE, computeDiffHash, git, mergeBase, readJson } from './lib.mjs';

const mode = process.argv.includes('--claude-hook') ? 'claude' : process.argv.includes('--git-hook') ? 'git' : 'manual';

// Prefix may be a quote/backtick too, so `bash -c "git push"` is still caught.
const GATED = [
  /(^|[\s;&|("'`])git(\s+-\S+(\s+\S+)?)*\s+push\b/, // git push, git -C dir push
  /(^|[\s;&|("'`])gh\s+pr\s+(create|merge)\b/,
];

/** `git push` options whose value is the NEXT token (`-o -d` → "-d" is a value, not a flag). */
const PUSH_OPTS_WITH_VALUE = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec', '--signed', '--force-with-lease']);

/** True only for a `git push` whose EVERY ref is a deletion (`--delete x`, `-d x`, `:x`). */
function isDeleteOnlyPush(part) {
  const m = /\bpush\b(.*)$/.exec(part);
  if (!m || /\bgh\s+pr\b/.test(part)) return false;
  const raw = m[1].trim().split(/\s+/).filter(Boolean);
  const hash = raw.findIndex((t) => t.startsWith('#')); // shell comment: `git push origin feat # -d`
  const tokens = (hash >= 0 ? raw.slice(0, hash) : raw).map((t) => t.replace(/^["'`]|["'`]$/g, ''));
  let deleteFlag = false;
  const positional = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '--delete' || t === '-d') deleteFlag = true;
    else if (PUSH_OPTS_WITH_VALUE.has(t)) i++; // skip its value
    else if (!t.startsWith('-')) positional.push(t);
  }
  const refspecs = positional.slice(1); // first positional is the remote
  if (!refspecs.length) return false;
  return deleteFlag || refspecs.every((r) => /^:[^:\s]+$/.test(r));
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function evaluate() {
  const last = readJson(LAST_RUN_FILE);
  const baseRef = last?.baseRef ?? 'origin/main';
  let mb;
  try {
    mb = mergeBase(baseRef);
  } catch (e) {
    return { open: false, reason: `${e.message}` };
  }
  let hasChanges;
  try {
    git(['diff', '--quiet', mb]); // exits 1 (throws) when there are differences
    hasChanges = git(['ls-files', '--others', '--exclude-standard']).trim() !== '';
  } catch {
    hasChanges = true;
  }
  if (!hasChanges) return { open: true, reason: 'no changes vs base — nothing to review' };
  if (!last) return { open: false, reason: 'no pr-self-review result yet' };
  const current = computeDiffHash(mb);
  if (current !== last.diffHash) {
    return { open: false, reason: `the last review (${last.timestamp}) is stale — the diff changed since (${last.diffHash.slice(0, 12)} → ${current.slice(0, 12)})` };
  }
  if (last.verdict !== 'PASS') {
    const crit = (last.findings ?? []).filter((f) => f.severity === 'critical' && f.status === 'new' && !f.waived);
    const lines = crit.slice(0, 10).map((f) => `  - ${f.file}${f.line ? `:${f.line}` : ''} · ${(f.rules ?? [f.rule]).join(', ')} · ${f.issue}`);
    const more = crit.length > 10 ? [`  … and ${crit.length - 10} more`] : [];
    const inc = last.incomplete?.length ? [`  - review incomplete: ${last.incomplete.join(', ')}`] : [];
    return { open: false, reason: `last review is BLOCK (${last.criticalCount} critical):\n${[...lines, ...more, ...inc].join('\n')}` };
  }
  return { open: true, reason: `PASS for the current diff (${current.slice(0, 12)}, ${last.timestamp})` };
}

const HOW = 'Run /pr-self-review (manual — auto-invoke is disabled), fix the critical findings or add a justified waiver, then retry.';

if (mode === 'claude') {
  let input = {};
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    // Fail closed: if the payload can't be read we can't tell whether it is a push.
    process.stderr.write('pr-self-review gate: unreadable hook payload — blocked (fail closed)\n');
    process.exit(2);
  }
  const command = String(input?.tool_input?.command ?? '');
  // Judge every chained part on its own: `gh pr create && git push origin :old` must stay gated.
  const parts = command.split(/&&|\|\||[;|\n]/);
  const gated = parts.some((p) => GATED.some((rx) => rx.test(p)) && !isDeleteOnlyPush(p));
  if (!gated) process.exit(0);
  let r;
  try {
    r = evaluate();
  } catch (e) {
    r = { open: false, reason: `gate error: ${e.message}` };
  }
  if (r.open) process.exit(0);
  process.stderr.write(`pr-self-review gate: blocked "${command.slice(0, 120)}" — ${r.reason}\n${HOW}\n`);
  process.exit(2);
}

if (mode === 'git') {
  const refs = readStdin().split('\n').filter(Boolean).map((l) => l.split(' '));
  if (refs.length && refs.every(([, lsha]) => /^0+$/.test(lsha))) process.exit(0); // deletions only
  const r = evaluate();
  if (r.open) process.exit(0);
  process.stderr.write(`\n✖ pr-self-review gate: push blocked — ${r.reason}\n${HOW}\n(Deliberate bypass: git push --no-verify)\n\n`);
  process.exit(1);
}

const r = evaluate();
console.log(`${r.open ? '✔ gate open' : '✖ gate closed'} — ${r.reason}`);
process.exit(r.open ? 0 : 1);
