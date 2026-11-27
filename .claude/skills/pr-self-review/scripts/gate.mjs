#!/usr/bin/env node
// Claude Code hook body (see .claude/hooks/pr-self-review-gate.sh). Reads the hook JSON from stdin.
//   gate.mjs pre   PreToolUse(Bash):  blocks `gh pr create|ready|merge` without a passing review (exit 2)
//   gate.mjs post  PostToolUse(Bash): after `git push`, posts the devdigest/self-review commit status
import { fingerprint, repoRoot, resolveBase } from './lib/git.mjs';
import { postStatus, resultForCommit } from './lib/status.mjs';

// Only a command in command position counts (start, or after ; & | ( newline, then/do/!, optional
// VAR=x prefixes) — so `echo "gh pr create"` or a quoted test string does not trip the gate.
const CMD_START = String.raw`(?:^|[;&|(\n]|\bthen\b|\bdo\b|!)\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*`;
const PR_CMD = new RegExp(CMD_START + String.raw`gh\s+pr\s+(create|ready|merge)\b`);
const PUSH_CMD = new RegExp(CMD_START + String.raw`git\s+(?:-C\s+\S+\s+)?push\b`);

const mode = process.argv[2];
let input = {};
try {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
} catch {
  process.exit(0); // not hook JSON — nothing to gate
}
const cmd = String(input?.tool_input?.command ?? '');

function block(msg) {
  process.stderr.write(`pr-self-review gate: ${msg}\n`);
  process.exit(2);
}

if (mode === 'pre') {
  const m = PR_CMD.exec(cmd);
  if (!m) process.exit(0);
  try {
    const root = repoRoot(input.cwd || process.cwd());
    const { sha, result } = resultForCommit(root, 'HEAD');
    const short = sha.slice(0, 7);
    if (!result) {
      const { baseSha } = resolveBase(root, 'HEAD');
      const dirty = fingerprint(root, { baseSha }) !== fingerprint(root, { baseSha, commit: sha });
      block(
        `\`gh pr ${m[1]}\` is blocked — no self-review matches the committed state of HEAD (${short}). ` +
          'Run /pr-self-review first.' +
          (dirty ? ' Note: there are uncommitted/untracked changes; a review that included them counts only once the committed state equals what was reviewed.' : ''),
      );
    }
    if (result.verdict !== 'pass') {
      const why = result.incomplete?.length
        ? `the review is incomplete (${result.incomplete.length} step(s))`
        : `${result.blocking.length} blocking CRITICAL finding(s): ${result.blocking.join(', ')}`;
      block(`\`gh pr ${m[1]}\` is blocked — /pr-self-review verdict for ${short} is FAIL: ${why}. Fix them and re-run /pr-self-review.`);
    }
    if (result.override) {
      process.stderr.write(`pr-self-review gate: passing on user override ("${result.override.reason}") — include it in the PR body.\n`);
    }
    process.exit(0);
  } catch (e) {
    block(`could not verify the self-review (${e.message}). Run /pr-self-review.`); // fail closed
  }
}

if (mode === 'post') {
  if (!PUSH_CMD.test(cmd)) process.exit(0);
  try {
    const r = await postStatus(repoRoot(input.cwd || process.cwd()), 'HEAD');
    const msg = `pr-self-review: ${r.message}${r.state === 'pending' ? ' — run /pr-self-review, then push again or run post-status.mjs' : ''}`;
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }));
  } catch {
    /* never break a push over a status */
  }
  process.exit(0);
}

process.exit(0);
