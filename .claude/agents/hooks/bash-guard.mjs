#!/usr/bin/env node
// PreToolUse hook (Bash) for subagents: a FIXED-SHAPE allowlist, nothing else runs.
//   node bash-guard.mjs <profile>      profile ∈ { review, verify, tests, docs }
//   docs   = cd <dir inside the repo> · git status|diff|log|show with a small flag allowlist (doc-writer)
//   review = docs + `node scripts/check-architecture.mjs` in server/ (architecture-reviewer)
//   verify = review + in client/ server/ reviewer-core/ (plan-verifier):
//              node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
//              node node_modules/vitest/vitest.mjs run [<paths>] [--exclude '**/*.it.test.ts'] [-t "<name>"] [--sequence.shuffle]
//   tests  = verify + rm [-f] [--] <its own untracked mut-*.ts(x) scratch files> (test-writer)
// Input: hook JSON on stdin (tool_input.command). Exit 0 = allow, exit 2 = block (stderr goes back to
// the agent). FAILS CLOSED: bad JSON, a missing command, an unknown profile or an unparsable command.
//
// NO FILE-READING / TEXT COMMANDS (cat head tail grep rg sort find wc sed ls echo …, git grep/blame):
// the agents read files with Read/Grep/Glob. Filtering the arguments of those commands kept leaking
// .env and server/clones/*/.git/config through new flag spellings, so they are gone, and every allowed
// command is matched against a fixed shape instead of a denylist of flags.
// `cd` stays inside the repo and out of server/clones, node_modules and .git: git's implicit
// --no-index (a path outside the work tree, or another repo as cwd) and a clone's own vitest config
// would otherwise reach untracked secrets or run imported code.
//
// THIS IS A HEURISTIC. The Claude Code docs say a Bash PreToolUse denylist "can be bypassed" (e.g. by
// redirects); this guard is an allowlist and also rejects $( ` <( >( & redirects VAR=… prefixes,
// unquoted globs/braces, unquoted `~` and every `$` outside single quotes ($VAR, $'…', $"…"); paths are
// also checked after realpath (symlinks, 8.3 short names). The hard limit is the
// agent's `tools` allowlist (no Write/Edit for reviewers) — never the guard alone.
// https://code.claude.com/docs/en/sub-agents
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const PROFILES = ['review', 'verify', 'tests', 'docs'];
const GIT_SUMMARY =
  'cd <dir in the repo>, git [--no-pager] status [--porcelain|--short|-s] | diff [--name-status|--name-only|--stat|--cached|--staged|-U<n>] | log [--oneline|--stat|--name-status|--name-only|-p|--follow|-<n>|-n <n>] | show [--stat|--name-status|--name-only|--oneline] + revisions/paths';
const ALLOWED_SUMMARY = { docs: GIT_SUMMARY };
ALLOWED_SUMMARY.review = `${ALLOWED_SUMMARY.docs}; in server/: node scripts/check-architecture.mjs`;
ALLOWED_SUMMARY.verify = `${ALLOWED_SUMMARY.review}; in client/ server/ reviewer-core/: node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json, node node_modules/vitest/vitest.mjs run [<paths>] [--exclude '**/*.it.test.ts'] [-t "<name>"] [--sequence.shuffle]`;
ALLOWED_SUMMARY.tests = `${ALLOWED_SUMMARY.verify}; rm [-f] <your untracked mut-*.ts(x) scratch files>`;
const HINTS = 'Read and search files with Read/Grep/Glob (cat/grep/ls/find/… are blocked).';

class Reject extends Error {}

// ---------- tokenizer: segments of unquoted words; rejects dangerous shell syntax ----------
function parse(cmd) {
  const segments = [];
  let words = [];
  let cur = '';
  let inWord = false;
  const pushWord = () => {
    if (inWord) words.push(cur);
    cur = '';
    inWord = false;
  };
  const endSeg = () => {
    pushWord();
    if (words.length) segments.push(words);
    words = [];
  };
  const STOP = new Set([' ', '\t', '\n', ';', '&', '|', '<', '>', '(', ')']);

  // read one word starting at i (for a redirect target); returns [word, next index]
  const readWord = (i) => {
    let w = '';
    while (i < cmd.length && !STOP.has(cmd[i])) {
      const c = cmd[i];
      if (c === "'" || c === '"') {
        const j = cmd.indexOf(c, i + 1);
        if (j < 0) throw new Reject('unterminated quote');
        w += cmd.slice(i + 1, j);
        i = j + 1;
      } else if (c === '\\' && i + 1 < cmd.length) {
        w += cmd[i + 1];
        i += 2;
      } else {
        w += c;
        i += 1;
      }
    }
    return [w, i];
  };

  // `>`, `>>` (fd prefix already consumed) or `&>`: only /dev/null or an fd dup (2>&1, >&2)
  const readRedirect = (i, allowDup) => {
    if (cmd[i] === '>') i += 1;
    if (cmd[i] === '&') {
      if (!allowDup) throw new Reject('redirect');
      let j = i + 1;
      while (/[0-9]/.test(cmd[j] ?? '')) j += 1;
      if (j === i + 1) throw new Reject('redirect');
      return j;
    }
    if (cmd[i] === '|' || cmd[i] === '(') throw new Reject('redirect');
    while (cmd[i] === ' ' || cmd[i] === '\t') i += 1;
    const [target, next] = readWord(i);
    if (target !== '/dev/null') throw new Reject(`redirect to "${target}"`);
    return next;
  };

  let i = 0;
  while (i < cmd.length) {
    const c = cmd[i];
    if (c === "'") {
      const j = cmd.indexOf("'", i + 1);
      if (j < 0) throw new Reject('unterminated quote');
      cur += cmd.slice(i + 1, j);
      inWord = true;
      i = j + 1;
    } else if (c === '"') {
      let j = i + 1;
      for (; j < cmd.length && cmd[j] !== '"'; j++) {
        const d = cmd[j];
        if (d === '`' || (d === '$' && cmd[j + 1] === '(')) throw new Reject('command substitution');
        if (d === '$') throw new Reject('"$" outside single quotes');
        if (d === '\\' && '$`"\\\n'.includes(cmd[j + 1] ?? '')) {
          cur += cmd[j + 1];
          j += 1;
        } else cur += d;
      }
      if (j >= cmd.length) throw new Reject('unterminated quote');
      inWord = true;
      i = j + 1;
    } else if (c === '\\') {
      if (i + 1 < cmd.length && cmd[i + 1] !== '\n') {
        cur += cmd[i + 1];
        inWord = true;
      }
      i += 2;
    } else if (c === '`' || (c === '$' && cmd[i + 1] === '(')) {
      throw new Reject('command substitution');
    } else if (c === '$') {
      throw new Reject('"$" outside single quotes ($VAR, $\'…\', $"…")');
    } else if (c === '*' || c === '?' || c === '[' || c === '{') {
      throw new Reject(`unquoted "${c}" (glob/brace expansion) — quote the pattern`);
    } else if ((c === '<' || c === '>') && cmd[i + 1] === '(') {
      throw new Reject('process substitution');
    } else if (c === ' ' || c === '\t') {
      pushWord();
      i += 1;
    } else if (c === '\n' || c === ';') {
      endSeg();
      i += 1;
    } else if (c === '&') {
      if (cmd[i + 1] === '&') {
        endSeg();
        i += 2;
      } else if (cmd[i + 1] === '>') {
        pushWord();
        i = readRedirect(i + 2, false);
      } else throw new Reject('background "&"');
    } else if (c === '|') {
      if (cmd[i + 1] === '&') throw new Reject('"|&"');
      endSeg();
      i += cmd[i + 1] === '|' ? 2 : 1;
    } else if (c === '>') {
      if (inWord && /^[0-9]+$/.test(cur)) {
        cur = '';
        inWord = false;
      } else pushWord();
      i = readRedirect(i + 1, true);
    } else if (c === '<') {
      throw new Reject('input redirect / here-doc');
    } else if (c === '(' || c === ')') {
      throw new Reject('subshell');
    } else if (c === '~') {
      // bash expands ~, ~/…, ~user, ~+, ~- (and after `=`/`:` in some words) to dirs outside the repo
      throw new Reject('unquoted "~" (tilde expansion)');
    } else {
      cur += c;
      inWord = true;
      i += 1;
    }
  }
  endSeg();
  return segments;
}

// ---------- paths ----------
const norm = (p) => p.replace(/\\/g, '/');
const isAbs = (p) => p.startsWith('/') || /^[A-Za-z]:\//.test(p);
// lexical resolve (a quoted "~" is a literal name for the shell; unquoted "~" never reaches here)
function resolve(base, p) {
  const q = norm(p);
  return path.posix.normalize(isAbs(q) ? q : `${base}/${q}`).replace(/(.)\/$/, '$1');
}
// canonical path: realpath of the deepest existing ancestor + the not-yet-existing rest. Resolves
// symlinks/junctions and Windows 8.3 short names (CLONES~1) so the checks see the real target.
function real(abs) {
  let head = abs;
  let rest = '';
  while (!existsSync(head)) {
    const parent = path.posix.dirname(head);
    if (parent === head) return abs;
    rest = `/${path.posix.basename(head)}${rest}`;
    head = parent;
  }
  try {
    return norm(realpathSync.native(head)).replace(/(.)\/$/, '$1') + rest;
  } catch {
    return null; // unreadable ⇒ fail closed
  }
}
// repo-relative path, or null when outside the repo (case-insensitive on Windows drive paths)
function repoRel(ctx, abs) {
  const ci = /^[A-Za-z]:\//.test(ctx.root);
  const r = ci ? ctx.root.toLowerCase() : ctx.root;
  const a = ci ? abs.toLowerCase() : abs;
  if (a === r) return '';
  if (!a.startsWith(`${r}/`)) return null;
  return abs.slice(ctx.root.length + 1);
}
const FORBIDDEN_SEG = /(^|\/)(clones|node_modules|\.git)(\/|$)/i;
const ENV = /(^|\/)\.env(?!\.example$)/i;
const SHORT_NAME = /~[0-9]/; // Windows 8.3 alias (GIT~1, CLONES~1, ENV~1)
const lexicallySafe = (ctx, abs) => {
  const rel = repoRel(ctx, abs);
  return rel !== null && !FORBIDDEN_SEG.test(rel) && !ENV.test(rel) && !SHORT_NAME.test(rel);
};
// a directory an agent may be in / a path git, vitest or rm may be pointed at: both the path as
// written and its canonical target must be inside the repo and outside clones/node_modules/.git/.env
function safeRel(ctx, abs) {
  if (!lexicallySafe(ctx, abs)) return false;
  const r = real(abs);
  return r !== null && lexicallySafe(ctx, r);
}
const cwdIs = (ctx, dirs) => dirs.includes(repoRel(ctx, ctx.cwd));
const PACKAGES = ['client', 'server', 'reviewer-core'];

// ---------- git: status|diff|log|show with a flag allowlist ----------
const GIT_FLAGS = {
  status: ['--porcelain', '--short', '-s'],
  diff: ['--name-status', '--name-only', '--stat', '--cached', '--staged'],
  log: ['--oneline', '--stat', '--name-status', '--name-only', '-p', '--follow'],
  show: ['--stat', '--name-status', '--name-only', '--oneline'],
};
function gitOk(w, ctx) {
  if (w[0] !== 'git') return false;
  let k = 1;
  if (w[k] === '--no-pager') k += 1;
  const sub = w[k];
  if (!GIT_FLAGS[sub]) return false;
  const args = w.slice(k + 1);
  let pathsOnly = false;
  for (let j = 0; j < args.length; j++) {
    const a = args[j];
    if (!pathsOnly && a === '--') {
      pathsOnly = true;
      continue;
    }
    if (!pathsOnly && a.startsWith('-')) {
      if (GIT_FLAGS[sub].includes(a)) continue;
      if (sub === 'diff' && /^-U[0-9]{1,3}$/.test(a)) continue;
      if (sub === 'log' && /^-[0-9]{1,4}$/.test(a)) continue;
      if (sub === 'log' && a === '-n' && /^[0-9]{1,4}$/.test(args[j + 1] ?? '')) {
        j += 1;
        continue;
      }
      return false; // everything else: --output, --ext-diff, --no-index, -O, -c, --textconv, …
    }
    // a revision, range, <rev>:<path> or pathspec. `<rev>:<path>` shows tracked content only; anything
    // else is resolved as a path and must stay inside the repo (outside ⇒ git's implicit --no-index).
    const p = !pathsOnly && /^[^/]*:/.test(a) && !/^[A-Za-z]:\//.test(a) ? a.slice(a.indexOf(':') + 1) : a;
    if (p && !safeRel(ctx, resolve(ctx.cwd, p))) return false;
  }
  return true;
}

// ---------- node tools: fixed shapes, run from the package directory ----------
const nodeCmd = (w, script) => w[0] === 'node' && norm(w[1] ?? '') === script;

function checkerOk(w, ctx) {
  return w.length === 2 && nodeCmd(w, 'scripts/check-architecture.mjs') && cwdIs(ctx, ['server']);
}

function tscOk(w, ctx) {
  return (
    w.length === 5 &&
    nodeCmd(w, 'node_modules/typescript/bin/tsc') &&
    w[2] === '--noEmit' && w[3] === '-p' && w[4] === 'tsconfig.json' &&
    cwdIs(ctx, PACKAGES)
  );
}

function vitestOk(w, ctx) {
  if (!nodeCmd(w, 'node_modules/vitest/vitest.mjs') || w[2] !== 'run' || !cwdIs(ctx, PACKAGES)) return false;
  const args = w.slice(3);
  const seen = new Set();
  for (let j = 0; j < args.length; j++) {
    const a = args[j];
    const once = (key) => !seen.has(key) && seen.add(key);
    if (a === '-t') {
      // vitest's parser reads a "-…" token after -t as the next option (-t --config=…, -t -u)
      if (!once('-t') || args[j + 1] === undefined || args[j + 1].startsWith('-')) return false;
      j += 1; // the test name: any text, it is only a filter
    } else if (a === '--sequence.shuffle') {
      if (!once(a)) return false;
    } else if (a === '--exclude') {
      if (!once(a) || args[j + 1] !== '**/*.it.test.ts') return false;
      j += 1;
    } else if (a.startsWith('-')) {
      return false; // --config, --root, --dir, -u, --coverage, --reporter, --outputFile, …
    } else {
      // a test file / folder filter inside this package
      const rel = repoRel(ctx, resolve(ctx.cwd, a));
      const pkg = repoRel(ctx, ctx.cwd);
      if (rel === null || !(rel === pkg || rel.startsWith(`${pkg}/`)) || !safeRel(ctx, resolve(ctx.cwd, a))) return false;
    }
  }
  return true;
}

// ---------- test-writer: rm of its own RED-check scratch files ----------
// mut-*.ts/tsx inside a package, never under node_modules / vendor / clones
const SCRATCH = /^(client|server|reviewer-core)\/(?!(.*\/)?(node_modules|vendor|clones)\/)(.+\/)?mut-[A-Za-z0-9_.-]+\.tsx?$/;
function scratchRmOk(w, ctx) {
  if (w[0] !== 'rm') return false;
  let k = 1;
  if (w[k] === '-f') k += 1;
  if (w[k] === '--') k += 1;
  const files = w.slice(k);
  if (!files.length || files.some((a) => a.startsWith('-'))) return false; // no -r / -d / -i …
  for (const f of files) {
    const rel = repoRel(ctx, resolve(ctx.cwd, f));
    if (rel === null || !SCRATCH.test(rel) || !safeRel(ctx, resolve(ctx.cwd, f))) return false;
    const tracked = spawnSync('git', ['ls-files', '--', rel], { cwd: ctx.root, encoding: 'utf8' });
    if (tracked.status !== 0 || tracked.stdout.trim()) return false; // fails closed; never a tracked file
  }
  return true;
}

const MATCHERS = {
  docs: [gitOk],
  review: [gitOk, checkerOk],
  verify: [gitOk, checkerOk, tscOk, vitestOk],
  tests: [gitOk, checkerOk, tscOk, vitestOk, scratchRmOk],
};

function checkSegment(profile, w, ctx) {
  if (w[0] === 'cd') {
    if (w.length !== 2 || w[1].startsWith('-')) return false; // `cd -` = previous dir, unknown here
    const next = resolve(ctx.cwd, w[1]);
    if (!safeRel(ctx, next)) return false; // inside the repo, not clones / node_modules / .git
    ctx.cwd = next;
    return true;
  }
  if (!safeRel(ctx, ctx.cwd)) return false; // the agent was started outside the repo
  return MATCHERS[profile].some((m) => m(w, ctx));
}

// ---------- main ----------
function block(msg) {
  console.error(msg);
  process.exit(2);
}

const profile = process.argv[2];
if (!PROFILES.includes(profile)) block(`Blocked (bash-guard): unknown profile "${profile ?? ''}" — fix the agent's hook command.`);

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  block(`Blocked (bash-guard ${profile}): unreadable hook input.`);
}
const command = input?.tool_input?.command;
if (typeof command !== 'string' || !command.trim()) block(`Blocked (bash-guard ${profile}): no command in tool input.`);

const tail = `Allowed: ${ALLOWED_SUMMARY[profile]}. ${HINTS} Ask the caller for anything else.`;
const rawRoot = norm(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()).replace(/(.)\/$/, '$1');
const root = real(rawRoot) ?? rawRoot;
const ctx = { root, cwd: norm(input.cwd || root).replace(/(.)\/$/, '$1') };
let segments;
try {
  segments = parse(command);
} catch (e) {
  if (!(e instanceof Reject)) throw e;
  block(`Blocked (bash-guard ${profile}): "${command}" is not allowed (${e.message}). ${tail}`);
}
for (const w of segments) {
  if (!checkSegment(profile, w, ctx)) block(`Blocked (bash-guard ${profile}): "${w.join(' ')}" is not allowed. ${tail}`);
}
process.exit(0);
