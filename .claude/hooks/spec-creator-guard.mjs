#!/usr/bin/env node
// PreToolUse guard for the `spec-creator` subagent (wired in its frontmatter).
// - Write/Edit: only `YYYY-MM-DD-<slug>.md` directly inside a module specs/ folder.
// - Bash: only `date +%Y-%m-%d` (the agent needs today's date for the Spec ID).
// Anything else exits 2, which blocks the call and returns stderr to the agent.
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import path from 'node:path';

const ALLOWED_DIRS = [
  'specs',
  'server/specs',
  'client/specs',
  'reviewer-core/specs',
  'mcp-server/specs',
];
const SPEC_FILE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const ALLOWED_BASH = /^\s*date(\s+\+%Y-%m-%d|\s+'\+%Y-%m-%d'|\s+"\+%Y-%m-%d")?\s*$/;

function block(reason, hint) {
  process.stderr.write(`spec-creator-guard: ${reason}\n${hint}\n`);
  process.exit(2);
}

const WRITE_HINT =
  `spec-creator may only write spec files named YYYY-MM-DD-<kebab-slug>.md directly inside: ` +
  `${ALLOWED_DIRS.map((d) => d + '/').join(', ')}`;

// Resolve symlinks on the deepest existing ancestor, so a not-yet-created
// file or folder (e.g. mcp-server/specs/) still gets a canonical path.
function canonical(p) {
  let existing = p;
  const rest = [];
  while (!existsSync(existing)) {
    rest.unshift(path.basename(existing));
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  return path.join(realpathSync(existing), ...rest);
}

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  block('could not parse hook input', WRITE_HINT);
}

if (input?.tool_name === 'Bash') {
  const command = input?.tool_input?.command ?? '';
  if (!ALLOWED_BASH.test(command)) {
    block(`Bash command not allowed: ${JSON.stringify(command)}`, 'spec-creator may only run `date +%Y-%m-%d`.');
  }
  process.exit(0);
}

const filePath = input?.tool_input?.file_path;
if (typeof filePath !== 'string' || filePath.length === 0) {
  block('no file_path in tool input', WRITE_HINT);
}

const root = canonical(path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()));
const target = canonical(path.resolve(root, filePath));
const rel = path.relative(root, target).split(path.sep).join('/');

if (rel.startsWith('..') || path.isAbsolute(rel)) block(`"${filePath}" is outside the repository`, WRITE_HINT);

const dir = path.posix.dirname(rel);
const base = path.posix.basename(rel);

if (!ALLOWED_DIRS.includes(dir)) block(`"${rel}" is not inside an allowed specs/ folder`, WRITE_HINT);
if (!SPEC_FILE.test(base)) block(`"${rel}" is not named YYYY-MM-DD-<kebab-slug>.md`, WRITE_HINT);

process.exit(0);
