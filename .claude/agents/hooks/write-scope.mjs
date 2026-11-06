#!/usr/bin/env node
// PreToolUse hook (Write|Edit) for subagents that may write only a narrow set of files.
//   node write-scope.mjs <profile>     profile ∈ { tests, docs }
//   tests → test-writer: test files + test helpers only
//   docs  → doc-writer:  README.md / TESTING.md / <pkg>/docs/**/*.md / module READMEs
// Input: hook JSON on stdin (tool_input.file_path). Exit 0 = allow, exit 2 = block (stderr goes back
// to the agent). FAILS CLOSED: bad JSON, a missing path or an unknown profile all block.
// Order: outside the project root → block; DENY → block; profile ALLOW → allow; else block.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PKGS = '{server,client,reviewer-core,e2e}';

const DENY = [
  '**/vendor/**',
  '**/node_modules/**',
  'server/clones/**',
  'server/src/db/migrations/**',
  '**/INSIGHTS.md',
  '**/CLAUDE.md',
  '**/AGENTS.md',
  'plans/**',
  '.claude/**',
  'docs/**',
  '**/pnpm-lock.yaml',
  '**/package-lock.json',
  '**/.env*',
];

const ALLOW = {
  tests: [
    'client/src/**/*.test.ts',
    'client/src/**/*.test.tsx',
    'client/src/test/**/*.ts',
    'client/src/test/**/*.tsx',
    'server/test/**/*.ts',
    'server/src/**/*.test.ts',
    'reviewer-core/test/**/*.ts',
    'reviewer-core/src/**/*.test.ts',
  ],
  docs: [
    'README.md',
    'TESTING.md',
    `${PKGS}/README.md`,
    `${PKGS}/docs/**/*.md`,
    'server/src/modules/*/README.md',
  ],
};

// Minimal glob → RegExp: `**/` = zero or more dirs, `**` = anything, `*` = no `/`, `{a,b}` = alternation.
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else if (c === '{') re += '(?:';
    else if (c === '}') re += ')';
    else if (c === ',' ) re += '|';
    else re += c.replace(/[.+?^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

const matchesAny = (rel, globs) => globs.some((g) => globToRegExp(g).test(rel));

function block(msg) {
  console.error(msg);
  process.exit(2);
}

const profile = process.argv[2];
if (!ALLOW[profile]) block(`Blocked (write-scope): unknown profile "${profile ?? ''}" — fix the agent's hook command.`);

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  block(`Blocked (write-scope ${profile}): unreadable hook input.`);
}

const file = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
if (typeof file !== 'string' || !file) block(`Blocked (write-scope ${profile}): no file_path in tool input.`);

const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const target = path.resolve(input.cwd || root, file);
const rel = path.relative(root, target).replace(/\\/g, '/');

const allowed = ALLOW[profile].join(', ');
if (!rel || rel.startsWith('../') || rel === '..' || path.isAbsolute(rel)) {
  block(`Blocked (write-scope ${profile}): ${file} is outside the project — allowed: ${allowed}. Report what you needed instead.`);
}
if (matchesAny(rel, DENY)) {
  block(`Blocked (write-scope ${profile}): ${rel} is a protected path — allowed: ${allowed}. Report what you needed instead.`);
}
if (matchesAny(rel, ALLOW[profile])) process.exit(0);
block(`Blocked (write-scope ${profile}): ${rel} — allowed: ${allowed}. Report what you needed instead.`);
