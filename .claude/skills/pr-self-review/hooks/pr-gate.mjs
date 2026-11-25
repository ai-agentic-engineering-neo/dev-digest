#!/usr/bin/env node
// PreToolUse hook (Bash): a PR may be opened, or a branch with an open PR pushed, only when
// pr-self-review has a PASS verdict for EXACTLY the current diff (decisions D1, D4 in
// docs/pr-self-review-plan.md).
//  - `gh pr create`                      → gated
//  - `git push` to a branch with an open PR → gated (no PR, no gh, no network → not gated)
//  - everything else                     → untouched
// The gate is off only when the user sets PR_SELF_REVIEW_GATE=off in the environment Claude Code
// runs with (e.g. settings.local.json "env"); a prefix inside the command does not count.

import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collect, loadMap, DEFAULT_MAP } from '../scripts/collect.mjs';
import { verdictPath } from '../scripts/verdict.mjs';

// ---------- command parsing ----------

/** Quote-aware split of a shell command into segments (&&, ||, ;, |, newline) of word tokens. */
export function splitShell(cmd) {
  const segments = [];
  let words = [];
  let cur = '';
  let has = false;
  let quote = null;
  const endWord = () => { if (has) words.push(cur); cur = ''; has = false; };
  const endSeg = () => { endWord(); if (words.length) segments.push(words); words = []; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < cmd.length) cur += cmd[++i];
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; has = true; continue; }
    if (c === '\\' && i + 1 < cmd.length) { cur += cmd[++i]; has = true; continue; }
    if (c === ' ' || c === '\t') { endWord(); continue; }
    if (c === '\n' || c === ';') { endSeg(); continue; }
    if (c === '&' || c === '|') {
      endSeg();
      if (cmd[i + 1] === c) i++;
      continue;
    }
    if (c === '(' || c === ')' || c === '{' || c === '}') { endSeg(); continue; }
    cur += c; has = true;
  }
  endSeg();
  return segments;
}

const WRAPPERS = new Set(['env', 'command', 'time', 'nice', 'nohup', 'exec', 'builtin']);

/** Drop leading VAR=value assignments and wrappers like `env`, `command`. */
function stripPrefix(words) {
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) { i++; continue; }
    if (WRAPPERS.has(w)) { i++; while (i < words.length && words[i].startsWith('-')) i++; continue; }
    break;
  }
  return words.slice(i);
}

const base = (w) => path.basename(w ?? '');

/**
 * Find a gated action in a shell command.
 * Returns { kind: 'pr-create' | 'push', cwd } or null. `cwd` follows `cd <dir>` segments and
 * `git -C <dir>`, relative to `startCwd`.
 */
export function detectGated(cmd, startCwd) {
  let cwd = startCwd;
  for (const raw of splitShell(String(cmd ?? ''))) {
    const words = stripPrefix(raw);
    if (!words.length) continue;
    const prog = base(words[0]);
    if (prog === 'cd' || prog === 'pushd') {
      const dir = words.find((w, i) => i > 0 && !w.startsWith('-'));
      if (dir && !dir.startsWith('~') && !dir.includes('$')) cwd = path.resolve(cwd, dir);
      continue;
    }
    if (prog === 'gh') {
      // `gh [--repo x] pr create …`: global flags (and their values) may precede the subcommand
      const pr = words.indexOf('pr', 1);
      const flags = words.slice(1).filter((w) => w.startsWith('-'));
      if (pr > 0 && words[pr + 1] === 'create' && !flags.some((f) => f === '--help' || f === '-h')) {
        return { kind: 'pr-create', cwd };
      }
      continue;
    }
    if (prog === 'git') {
      let i = 1;
      let dir = cwd;
      // git global options before the subcommand
      while (i < words.length && words[i].startsWith('-')) {
        const opt = words[i];
        if (opt === '-C') { dir = path.resolve(dir, words[i + 1] ?? '.'); i += 2; continue; }
        if (opt === '-c' || opt === '--git-dir' || opt === '--work-tree' || opt === '--namespace') { i += 2; continue; }
        i++;
      }
      if (words[i] !== 'push') continue;
      const args = words.slice(i + 1);
      const harmless = args.some((a) => ['--dry-run', '-n', '--delete', '-d', '--help', '-h'].includes(a))
        || args.some((a) => /^:/.test(a)); // `git push origin :branch` deletes a branch
      if (!harmless) return { kind: 'push', cwd: dir };
    }
  }
  return null;
}

// ---------- gate ----------

/** Is there an OPEN PR for the current branch? Anything unknown → false (D4: not gated). */
export function hasOpenPr(repo) {
  try {
    const out = execFileSync('gh', ['pr', 'view', '--json', 'state', '-q', '.state'], {
      cwd: repo, encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() === 'OPEN';
  } catch {
    return false;
  }
}

/**
 * Decide for a gated action. Returns { allow: true } or { allow: false, reason }.
 * Deps are injectable for tests.
 */
export function evaluateGate({ kind, cwd }, deps = {}) {
  const {
    openPr = hasOpenPr,
    plan: makePlan = (repo) => collect({ repo, base: process.env.PR_SELF_REVIEW_BASE || 'origin/main', fetch: false, map: loadMap(DEFAULT_MAP) }),
    readVerdict = (repo, hash) => {
      const p = verdictPath(repo, hash);
      return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
    },
  } = deps;

  let repo;
  try {
    repo = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return { allow: true }; // not a git checkout → not ours to gate
  }

  if (kind === 'push' && !openPr(repo)) return { allow: true };
  const action = kind === 'push' ? '`git push` to a branch with an open PR' : '`gh pr create`';

  let plan;
  try { plan = makePlan(repo); } catch (e) {
    return { allow: false, reason: `pr-self-review gate: cannot compute the current diff (${e.message}). Fix that, then run /pr-self-review.` };
  }
  if (plan.empty) return { allow: true };

  const v = readVerdict(repo, plan.diffHash);
  const short = plan.diffHash.slice(0, 16);
  if (!v) {
    return {
      allow: false,
      reason: `pr-self-review gate: ${action} needs a PASS verdict for the current diff (${short}), and there is none — the changes were never reviewed or changed after the last review. Run the pr-self-review skill (/pr-self-review) first, then retry.`,
    };
  }
  if (v.verdict === 'PASS') return { allow: true };
  if (v.verdict === 'BLOCK') {
    const list = (v.findings ?? []).filter((f) => v.blocking.includes(f.id))
      .map((f) => `- ${f.id} ${f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : '(repo)'} — ${f.title}`).join('\n');
    return {
      allow: false,
      reason: `pr-self-review gate: ${action} is blocked — the review of the current diff (${short}) has ${v.blocking.length} blocking CRITICAL finding(s):\n${list}\nFix them and re-run /pr-self-review, or ask the user whether to waive one (\`node .claude/skills/pr-self-review/scripts/verdict.mjs waive <F-id> "<reason>"\` — only with the user's own reason). Report: ${verdictPath(repo, plan.diffHash, 'md')}`,
    };
  }
  return {
    allow: false,
    reason: `pr-self-review gate: ${action} is blocked — the review of the current diff (${short}) is INCOMPLETE:\n${(v.incomplete ?? []).map((x) => `- ${x}`).join('\n')}\nFix the cause and re-run /pr-self-review.`,
  };
}

// ---------- hook entry ----------

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.trim() ? JSON.parse(data) : {};
}

async function main() {
  if (process.env.PR_SELF_REVIEW_GATE === 'off') return;
  let input;
  try { input = await readStdin(); } catch { return; } // unreadable input: not ours
  if (input.tool_name && input.tool_name !== 'Bash') return;
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const gated = detectGated(input.tool_input?.command, cwd);
  if (!gated) return;
  let decision;
  try { decision = evaluateGate(gated); } catch (e) {
    decision = { allow: false, reason: `pr-self-review gate failed (${e.message}); not allowing ${gated.kind} until it works.` };
  }
  if (!decision.allow) deny(decision.reason);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
