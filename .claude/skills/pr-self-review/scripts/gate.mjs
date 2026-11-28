#!/usr/bin/env node
// PreToolUse hook for Bash: refuses `gh pr create` and `gh pr merge` unless the
// tree as it is now has a passing pr-self-review verdict. Every other command
// passes without touching git. A failure while checking a gated command denies.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PASSING, git, locateState, readJson, snapshot, statePaths } from './lib.mjs';

const GATED = /(?:^|[\s;&|()`'"])gh\s+(?:[^\n;&|]*?\s)?pr\s+(create|merge)(?=$|[\s;&|)`'"])/;
const RUN = 'Run the pr-self-review skill (/pr-self-review) first.';

export function isGated(command) {
  return GATED.test(command ?? '');
}

/** `{ allow: true }` or `{ allow: false, reason }` for the tree at `cwd`. */
export function decide({ cwd, skillDir } = {}) {
  if (git(cwd, ['rev-parse', '--show-toplevel'], { allowFail: true }) === null) {
    return { allow: true };
  }
  const paths = statePaths(locateState(cwd));
  const snap = snapshot({ cwd, skillDir, base: readJson(paths.last)?.base });
  if (snap.files.length === 0) return { allow: true };
  const verdict = readJson(paths.verdict(snap.key));
  if (!verdict) {
    return {
      allow: false,
      reason: `No pr-self-review verdict for the current changes (none yet, or the code changed since the last one). ${RUN}`,
    };
  }
  if (PASSING.has(verdict.status)) return { allow: true };
  const detail =
    verdict.status === 'BLOCKED'
      ? verdict.blocking.map((item) => `${item.rule} at ${item.file}:${item.line}`).join('; ')
      : verdict.incomplete.join('; ');
  return {
    allow: false,
    reason: `pr-self-review verdict is ${verdict.status}: ${detail}. Fix it and run the pr-self-review skill again.`,
  };
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input = {};
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    return;
  }
  if (!isGated(input?.tool_input?.command)) return;
  try {
    const decision = decide({ cwd: input.cwd || process.cwd() });
    if (!decision.allow) deny(decision.reason);
  } catch (err) {
    deny(`pr-self-review gate could not check this command: ${err.message}. ${RUN}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
