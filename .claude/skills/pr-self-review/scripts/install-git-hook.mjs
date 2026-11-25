#!/usr/bin/env node
// Opt-in installer for the level-2 git pre-push hook (hooks/git-pre-push.mjs).
//   node .claude/skills/pr-self-review/scripts/install-git-hook.mjs            install / update
//   node .claude/skills/pr-self-review/scripts/install-git-hook.mjs --status   show what is installed
//   node .claude/skills/pr-self-review/scripts/install-git-hook.mjs --uninstall
// Never overwrites a pre-push hook it did not write, and does nothing when core.hooksPath points
// to another hook manager (husky, lefthook…) — it prints how to call the check from there instead.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const MARKER = '# pr-self-review pre-push gate';
const HOOK_REL = '.claude/skills/pr-self-review/hooks/git-pre-push.mjs';

export function hookScript() {
  return `#!/bin/sh
${MARKER} — installed by ${path.posix.join('.claude/skills/pr-self-review/scripts', 'install-git-hook.mjs')}
# Refuses a push to a branch with an open PR unless the pushed commit has a PASS verdict.
# Remove with: node .claude/skills/pr-self-review/scripts/install-git-hook.mjs --uninstall
top="$(git rev-parse --show-toplevel)" || exit 1
script="$top/${HOOK_REL}"
if [ ! -f "$script" ]; then
  echo "pr-self-review: $script not found on this checkout — push not checked" >&2
  exit 0
fi
exec node "$script" "$@"
`;
}

const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

export function hookLocation(repo) {
  let custom = '';
  try { custom = git(repo, ['config', '--get', 'core.hooksPath']); } catch { /* not set */ }
  const dir = path.resolve(repo, git(repo, ['rev-parse', '--git-path', 'hooks']));
  return { dir, file: path.join(dir, 'pre-push'), customHooksPath: custom || null };
}

/** Returns { status, message }; status ∈ installed | updated | removed | absent | foreign | managed. */
export function run(repo, action = 'install') {
  const { dir, file, customHooksPath } = hookLocation(repo);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const ours = existing?.includes(MARKER) ?? false;
  const manual = `call it from your own pre-push hook: node "$(git rev-parse --show-toplevel)/${HOOK_REL}" "$@" (stdin must be passed through)`;

  if (action === 'status') {
    if (!existing) return { status: 'absent', message: `No pre-push hook at ${file}.` };
    return ours
      ? { status: 'installed', message: `pr-self-review pre-push gate is installed at ${file}.` }
      : { status: 'foreign', message: `${file} is another pre-push hook (not pr-self-review).` };
  }
  if (action === 'uninstall') {
    if (!existing) return { status: 'absent', message: `Nothing to remove: no pre-push hook at ${file}.` };
    if (!ours) return { status: 'foreign', message: `${file} was not written by pr-self-review — left untouched.` };
    fs.rmSync(file);
    return { status: 'removed', message: `Removed ${file}.` };
  }
  if (customHooksPath && !ours) {
    return { status: 'managed', message: `core.hooksPath is set to "${customHooksPath}" (a hook manager). Not installing there; ${manual}.` };
  }
  if (existing && !ours) {
    return { status: 'foreign', message: `${file} already exists and was not written by pr-self-review — not overwritten. To add the check, ${manual}.` };
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, hookScript(), { mode: 0o755 });
  fs.chmodSync(file, 0o755);
  return { status: ours ? 'updated' : 'installed', message: `${ours ? 'Updated' : 'Installed'} ${file}. Pushes to branches with an open PR now need a PASS verdict for the pushed commit; bypass with git push --no-verify.` };
}

function main() {
  const args = process.argv.slice(2);
  const action = args.includes('--uninstall') ? 'uninstall' : args.includes('--status') ? 'status' : 'install';
  const unknown = args.filter((a) => !['--uninstall', '--status'].includes(a));
  if (unknown.length) { console.error(`unknown argument ${unknown[0]}\nUsage: node install-git-hook.mjs [--status | --uninstall]`); return 2; }
  let repo;
  try { repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(); } catch {
    console.error('Not inside a git repository.'); return 1;
  }
  const r = run(repo, action);
  console.log(r.message);
  return ['foreign', 'managed'].includes(r.status) && action === 'install' ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
