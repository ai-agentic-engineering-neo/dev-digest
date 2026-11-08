#!/usr/bin/env node
// Self-test for the agent hooks + a frontmatter lint of every .claude/agents/*.md.
//   node .claude/agents/hooks/self-test.mjs        (from the repo root or anywhere)
// Exit 0: "✔ hooks self-test: <n> hook cases, <m> agent files" · exit 1: "✖ …" + one line per failure.
// Run it after editing any agent file or hook: Claude Code ignores unknown frontmatter keys and missing
// skills silently, so a typo would quietly drop an agent's limits.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOKS = path.dirname(fileURLToPath(import.meta.url));
const AGENTS = path.dirname(HOOKS);
const ROOT = path.resolve(AGENTS, '..', '..');
const failures = [];

// ---------- hook cases: [hook, profile, input, expected exit] ----------
const W = (p) => JSON.stringify({ tool_name: 'Write', tool_input: { file_path: p }, cwd: ROOT });
const B = (c) => JSON.stringify({ tool_name: 'Bash', tool_input: { command: c }, cwd: ROOT });
const ALLOW = 0;
const BLOCK = 2;

const cases = [];
const add = (hook, profile, inputs, expected, mk) => {
  for (const i of inputs) cases.push({ hook, profile, input: mk(i), label: i, expected });
};

// write-scope tests
add('write-scope.mjs', 'tests', [
  'client/src/lib/github-urls.test.ts',
  'server/test/helpers/pg.ts',
  'server/test/skills-service.it.test.ts',
  'reviewer-core/test/prompt.test.ts',
  'server/src/modules/skills/x.test.ts',
  'client/src/test/setup.ts',
  'client/src/app/skills/_components/SkillCard/SkillCard.test.tsx',
  path.join(ROOT, 'server', 'test', 'a.test.ts'), // absolute, OS-native separators
], ALLOW, W);
add('write-scope.mjs', 'tests', [
  'client/src/lib/github-urls.ts',
  'server/src/adapters/mocks.ts',
  'client/src/vendor/ui/kit/x.test.tsx',
  'server/src/vendor/shared/x.test.ts',
  'server/INSIGHTS.md',
  'plans/x.md',
  '.claude/agents/test-writer.md',
  '../outside.test.ts',
  'server/test/../src/app.ts',
  'server/.env.test.ts',
  'e2e/specs/01-x.flow.json',
], BLOCK, W);
// write-scope docs
add('write-scope.mjs', 'docs', [
  'server/docs/conventions.md',
  'server/docs/README.md',
  'client/README.md',
  'README.md',
  'TESTING.md',
  'e2e/docs/writing-a-flow.md',
  'server/src/modules/repo-intel/README.md',
], ALLOW, W);
add('write-scope.mjs', 'docs', [
  'server/specs/x.md',
  'docs/agent-prompts/general-reviewer.md',
  'server/INSIGHTS.md',
  'CLAUDE.md',
  'server/CLAUDE.md',
  'AGENTS.md',
  '.claude/agents/README.md',
  'plans/README.md',
  'server/docs/x.ts',
  'server/src/app.ts',
  'client/src/vendor/ui/README.md',
], BLOCK, W);
// write-scope specs (spec-creator): path normalized (\ → /, resolved against the root) BEFORE matching
add('write-scope.mjs', 'specs', [
  'server/specs/x.md',
  'client/specs/run-cost-badge.md',
  'reviewer-core/specs/README.md',
  'mcp-server/specs/x.md',
  'specs/x.md', // root: cross-module specs
  'specs/README.md',
  'specs\\x.md', // root, Windows separators
  path.join(ROOT, 'specs', 'x.md'), // root, absolute
  'server\\specs\\x.md', // Windows separators
  'client/specs/./x.md',
  path.join(ROOT, 'server', 'specs', 'x.md'), // absolute inside the repo, OS-native separators
  path.join(ROOT, 'client', 'specs', 'x.md').replace(/\\/g, '/'), // absolute, forward slashes
], ALLOW, W);
add('write-scope.mjs', 'specs', [
  'e2e/specs/x.md', // e2e/specs holds executable flows
  'e2e/specs/01-x.flow.json',
  'server/src/x.ts',
  'server/specs/../x.md',
  'server\\specs\\..\\src\\x.ts',
  'server/specs/sub/x.md',
  'server/specs/x.ts',
  'server/docs/x.md',
  'server/INSIGHTS.md',
  'server/CLAUDE.md',
  'specs/sub/x.md',
  'specs\\sub\\x.md',
  'specs/x.ts',
  'specs/../plans/x.md',
  'e2e/specs/sub/x.md',
  'docs/design/x.md',
  'plans/x.md',
  '.claude/agents/spec-creator.md',
  '../dev-digest-other/server/specs/x.md',
  path.join(ROOT, '..', 'outside', 'server', 'specs', 'x.md'), // absolute outside the repo
], BLOCK, W);
// write-scope fail-closed
cases.push({ hook: 'write-scope.mjs', profile: 'nope', input: W('server/test/a.test.ts'), label: 'unknown profile', expected: BLOCK });
cases.push({ hook: 'write-scope.mjs', profile: 'tests', input: '{not json', label: 'malformed JSON', expected: BLOCK });
cases.push({ hook: 'write-scope.mjs', profile: 'tests', input: JSON.stringify({ tool_input: {} }), label: 'no file_path', expected: BLOCK });

// bash-guard — fixed shapes only. Hook cwd = repo root (see B()).
const ALL = ['docs', 'review', 'verify', 'tests'];
const SERVER_ABS = path.join(ROOT, 'server'); // absolute, OS-native separators
// every profile: cd inside the repo + git status|diff|log|show with the flag allowlist
for (const profile of ALL) {
  add('bash-guard.mjs', profile, [
    'git diff --name-status main...HEAD',
    'git diff --name-status origin/main',
    'git diff -U0 origin/main -- server/src',
    'git diff --cached --stat',
    'git status --porcelain 2>&1',
    'git status --short 2>/dev/null',
    'git --no-pager log --oneline -5',
    'git log --oneline -n 3 -- server/src/app.ts',
    'git log -1 --oneline origin/main || git log -1 --oneline main',
    'git log --follow -p -- client/src/lib/github-urls.ts',
    'git show 0e4375c:server/src/modules/reviews/usage.ts',
    'git show --stat HEAD',
    'git log --oneline 9eb3e14..HEAD -- server/src/app.ts plans/TEMPLATE.md', // plan-verifier traceability

    "git log --oneline -- 'client/src/app/repos/[repoId]/page.tsx'",
    'cd server && git log --oneline -3',
    `cd "${SERVER_ABS}" && git status --short`,
    'cd client/src && cd ../.. && git status',
  ], ALLOW, B);
}

// every profile: everything else. Past bypasses stay here as regression cases.
const EVERYWHERE_BLOCKED = [
  // file-reading / text commands (use Read/Grep/Glob)
  'cat README.md',
  'cat .env',
  'cat .env.example',
  'head -5 README.md',
  'tail -n 20 server/src/app.ts',
  'less README.md',
  'grep -n x README.md',
  'rg token',
  'sed -n 1,5p README.md',
  'awk 1 README.md',
  'sort README.md',
  'uniq README.md',
  'wc -l README.md',
  'find client/src -name x',
  'ls server/docs',
  'echo hi',
  'pwd',
  'git diff --stat | head -5',
  // round 1: globs / braces / expansion reaching .env or clones
  'cat server/.e*',
  'cat server/.[e]nv',
  'cat server/.*',
  'cat server/clone?/r/.git/config',
  'cat server/*/r/.git/config',
  'cat server/.{e,x}nv',
  'cat server/.e$X\\nv',
  'cat "server/.e${X}nv"',
  'cat $HOME/x',
  'cat server/clones/r/.git/config',
  // round 1: recursive / indirect reads
  'grep -rn token server',
  'grep -r token server/clones/r',
  "grep -rn --exclude='.env*' --exclude-dir=clones token server",
  'cd server && cd clones && cat r/.git/config',
  'cd server/clones/r && cat .git/config',
  'cd server && cat .env',
  // round 2: abbreviated grep options, git --no-index / -C / clones paths
  'grep --recur token server',
  'grep --directories recurse token server',
  'grep -nd recurse token server',
  'cd server && git diff --no-index clones docs',
  'git diff --no-index server/clones/r/.git/config README.md',
  'git diff --no-ind a b',
  'cd server && git -C clones log',
  'cd server && git log -- clones',
  // round 3: git grep -O / --untracked, grep --include, sort --compress-program
  'git grep -n token',
  'git grep -Orm -l x',
  'git grep --untracked --no-exclude-standard -n KEY',
  "grep -r --exclude='.env*' --exclude-dir=clones --include=.env KEY .",
  'sort -S 1 --compress-program=sh README.md',
  // round 4: $'…' / $"…" quoting, implicit --no-index via cwd/paths, vitest in a clone
  "git diff $'--no-index' server/.env README.md",
  'git diff $"--output=x" main',
  "cd server && node node_modules/vitest/vitest.mjs run $'-u'",
  'cd .. && git diff dev-digest-main/server/.env x',
  'cd server/clones/r && git diff ../../.env .git/config',
  'git diff ../outside.txt README.md',
  'git diff server/.env README.md',
  'git show HEAD:../x',
  // round 5: tilde expansion, Windows 8.3 short names
  'git diff ~root/x README.md',
  'git diff ~/x README.md',
  'cd ~yanal',
  'cd ~+',
  'cd ~-',
  'git log -- a=~/x',
  'cd server/CLONES~1',
  'cd server/clones~1/r && git status',
  'git diff server/ENV~1 README.md',
  'cd GIT~1',
  // git: subcommands / flags outside the allowlist
  'git diff --output=x.patch',
  'git diff --out=x.patch',
  'git log -p --output x.patch',
  'git diff --ext-diff',
  'git diff --textconv',
  'git diff -O.env',
  'git diff --orderfile=.env',
  'git log --format=%H',
  'git log -n x',
  'git -C server log',
  'git -c core.pager=sh log',
  'git --git-dir=server/clones/r/.git log',
  'git rev-parse --verify origin/main',
  'git merge-base origin/main HEAD',
  'git branch --show-current',
  'git blame README.md',
  'git ls-files',
  'git checkout main',
  'git stash',
  'git add -A',
  'git commit -m x',
  'git remote -v',
  'git config --list',
  // cd outside the repo / into clones, node_modules, .git
  'cd ..',
  'cd /',
  'cd ~',
  'cd server/clones',
  'cd client/node_modules',
  'cd .git',
  'cd -',
  'cd',
  // shell syntax
  'git log > a.txt',
  'git log >> a.txt',
  'git log &> a.txt',
  'git log 1>a.txt',
  'git log $(pwd)',
  'git log `pwd`',
  'git log "$(id)"',
  'git log $HOME',
  'git diff -- server/*.ts',
  'sleep 1 &',
  'FOO=1 git status',
  'git log < /etc/passwd',
  'diff <(ls a) <(ls b)',
  '(cd server && git log)',
  'git log "unterminated',
  // other programs
  'rm -rf x',
  'node -e "1"',
  'node scripts/x.mjs',
  'npx vitest run',
  'pnpm test',
  'npm run e2e:hermetic',
];
for (const profile of ALL) add('bash-guard.mjs', profile, EVERYWHERE_BLOCKED, BLOCK, B);

// review ⊂ verify ⊂ tests: the layer checker, exactly, from server/
for (const profile of ['review', 'verify', 'tests']) {
  add('bash-guard.mjs', profile, [
    'cd server && node scripts/check-architecture.mjs',
    `cd "${SERVER_ABS}" && node scripts/check-architecture.mjs`,
  ], ALLOW, B);
  add('bash-guard.mjs', profile, [
    'node scripts/check-architecture.mjs', // repo root, not server/
    'node server/scripts/check-architecture.mjs',
    'cd server && node scripts/check-architecture.mjs --update',
    'cd server && node scripts/check-architecture.mjs --self-test',
    'cd server && node scripts/check-architecture.mjs --base /tmp/base.json',
    'cd server && node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src --output-type err',
  ], BLOCK, B);
}
add('bash-guard.mjs', 'docs', ['cd server && node scripts/check-architecture.mjs'], BLOCK, B);

// verify ⊂ tests: tsc + vitest, fixed shapes, from a package dir
for (const profile of ['verify', 'tests']) {
  add('bash-guard.mjs', profile, [
    'cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json',
    'cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json',
    'cd reviewer-core && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json',
    'cd server && node node_modules/vitest/vitest.mjs run test/a.test.ts',
    'cd server && node node_modules/vitest/vitest.mjs run',
    "cd server && node node_modules/vitest/vitest.mjs run --exclude '**/*.it.test.ts'",
    'cd client && node node_modules/vitest/vitest.mjs run src/lib/github-urls.test.ts -t "pins to the sha"',
    'cd client && node node_modules/vitest/vitest.mjs run --sequence.shuffle src/lib/a.test.ts src/lib/b.test.ts',
    "cd client && node node_modules/vitest/vitest.mjs run 'src/app/repos/[repoId]/x.test.tsx' -t 'it renders $5'",
  ], ALLOW, B);
  add('bash-guard.mjs', profile, [
    'node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json', // repo root, not a package
    'cd server && node node_modules/typescript/bin/tsc -p tsconfig.json',
    'cd server && node node_modules/typescript/bin/tsc --noEmit',
    'cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.build.json',
    'cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json --generateTrace t',
    'cd server && node node_modules/typescript/bin/tsc --build',
    'node node_modules/vitest/vitest.mjs run', // repo root
    'cd server/src && node ../node_modules/vitest/vitest.mjs run',
    'cd server && node node_modules/vitest/vitest.mjs',
    'cd server && node node_modules/vitest/vitest.mjs watch',
    'cd server && node node_modules/vitest/vitest.mjs run -u',
    'cd server && node node_modules/vitest/vitest.mjs run --update',
    'cd server && node node_modules/vitest/vitest.mjs run --coverage',
    'cd server && node node_modules/vitest/vitest.mjs run --outputFile=x.json',
    'cd server && node node_modules/vitest/vitest.mjs run --reporter=html',
    'cd server && node node_modules/vitest/vitest.mjs run --reporter verbose',
    'cd server && node node_modules/vitest/vitest.mjs run --config clones/r/vitest.config.ts',
    'cd server && node node_modules/vitest/vitest.mjs run --root clones/r',
    'cd server && node node_modules/vitest/vitest.mjs run --dir ../client',
    "cd server && node node_modules/vitest/vitest.mjs run --exclude '**/*.ts'",
    'cd server && node node_modules/vitest/vitest.mjs run clones/r',
    'cd server && node node_modules/vitest/vitest.mjs run ../client/src/a.test.ts',
    'cd server && node node_modules/vitest/vitest.mjs run -t a -t b',
    'cd server/clones/r && node ../../node_modules/vitest/vitest.mjs run',
    // round 5: an option smuggled as the -t value
    'cd server && node node_modules/vitest/vitest.mjs run -t --config=clones/r/vitest.config.ts',
    'cd server && node node_modules/vitest/vitest.mjs run -t -u',
    'cd server && node node_modules/vitest/vitest.mjs run -t --root clones/r',
    'cd server && node node_modules/vitest/vitest.mjs run -t --outputFile=x.json',
  ], BLOCK, B);
}
for (const profile of ['docs', 'review']) {
  add('bash-guard.mjs', profile, [
    'cd server && node node_modules/vitest/vitest.mjs run',
    'cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json',
  ], BLOCK, B);
}

// tests only: rm [-f] of its own untracked mut-* RED-check scratch files inside a package
add('bash-guard.mjs', 'tests', [
  'rm client/src/test/mut-gu.ts client/src/lib/mut-gu.test.ts',
  'rm -f server/test/mut-run.ts',
  'cd client && rm -f -- src/lib/mut-gu.test.ts',
  'rm reviewer-core/src/mut-prompt.test.tsx',
], ALLOW, B);
add('bash-guard.mjs', 'tests', [
  'rm client/src/lib/github-urls.test.ts', // not a mut-* file
  'rm client/src/lib/mut-gu.js',
  'rm -rf client/src/lib/mut-gu.ts',
  'rm -r client/src/test',
  'rm -i client/src/lib/mut-gu.ts',
  'rm client/src/lib/mut-*.ts',
  'rm mut-x.ts', // repo root, not inside a package
  'rm e2e/mut-x.ts',
  'rm client/node_modules/x/mut-a.ts',
  'rm client/src/vendor/ui/mut-a.ts',
  'rm server/clones/r/mut-a.ts',
  'rm ../mut-a.ts',
  'rm client/src/../../mut-a.ts',
  'rm .claude/agents/hooks/self-test.mjs',
  'rm server/.env',
  'rm',
], BLOCK, B);
for (const profile of ['docs', 'review', 'verify']) add('bash-guard.mjs', profile, ['rm client/src/test/mut-gu.ts'], BLOCK, B);
// bash-guard fail-closed
cases.push({ hook: 'bash-guard.mjs', profile: 'nope', input: B('ls'), label: 'unknown profile', expected: BLOCK });
cases.push({ hook: 'bash-guard.mjs', profile: 'review', input: 'nope', label: 'malformed JSON', expected: BLOCK });
cases.push({ hook: 'bash-guard.mjs', profile: 'review', input: B('   '), label: 'empty command', expected: BLOCK });

// plans-only-write.mjs (unchanged; regression only)
add('plans-only-write.mjs', undefined, ['plans/x.md'], ALLOW, W);
add('plans-only-write.mjs', undefined, ['plans/sub/x.md', 'server/a.ts'], BLOCK, W);

for (const c of cases) {
  const args = [path.join(HOOKS, c.hook), ...(c.profile ? [c.profile] : [])];
  const r = spawnSync(process.execPath, args, {
    input: c.input,
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
    encoding: 'utf8',
  });
  if (r.status !== c.expected) {
    failures.push(`${c.hook} ${c.profile ?? ''} "${c.label}": expected exit ${c.expected}, got ${r.status} ${(r.stderr || '').trim().slice(0, 160)}`);
  } else if (r.status === BLOCK && c.profile && c.profile !== 'nope' && !r.stderr.includes(c.profile)) {
    failures.push(`${c.hook} ${c.profile} "${c.label}": block message does not name the profile`);
  }
}

// ---------- frontmatter lint ----------
const KEYS = new Set([
  'name', 'description', 'tools', 'disallowedTools', 'model', 'permissionMode', 'maxTurns', 'skills', 'hooks',
  'memory', 'effort', 'isolation', 'omitClaudeMd', 'autoCompactWindow', 'mcpServers', 'background', 'color',
]);
const PROFILES = {
  'write-scope.mjs': ['tests', 'docs', 'specs'],
  'bash-guard.mjs': ['review', 'verify', 'tests', 'docs'],
};
// MCP tools: names come from the devdigest server's registerTool() calls, so a typo or a removed tool
// fails here instead of being dropped silently. Agents that must never start a paid review run:
const MCP_TOOLS = new Set(
  readdirSync(path.join(ROOT, 'mcp-server', 'src', 'tools'))
    .filter((f) => f.endsWith('.ts'))
    .flatMap((f) => [...readFileSync(path.join(ROOT, 'mcp-server', 'src', 'tools', f), 'utf8')
      .matchAll(/registerTool\(\s*'([a-z_]+)'/g)].map((m) => `mcp__devdigest__${m[1]}`)),
);
const MCP_FORBIDDEN = { 'spec-creator': ['mcp__devdigest__run_agent_on_pr'] };

function lintAgent(file, rawText) {
  const out = [];
  const text = rawText.replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) {
    out.push(`${file}: no frontmatter`);
    return out;
  }
  const lines = m[1].split('\n');
  const fm = {};
  let key = null;
  for (const line of lines) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const top = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
    if (top) {
      key = top[1];
      fm[key] = { value: top[2].trim(), items: [], raw: [] };
      if (!KEYS.has(key)) out.push(`${file}: unknown frontmatter key "${key}" (ignored silently by Claude Code)`);
    } else if (key) {
      fm[key].raw.push(line);
      const item = /^\s+-\s+([^#\s]+)/.exec(line);
      if (item) fm[key].items.push(item[1]);
    } else out.push(`${file}: unparsable frontmatter line "${line}"`);
  }
  const base = file.replace(/\.md$/, '');
  if (fm.name?.value !== base) out.push(`${file}: name "${fm.name?.value}" ≠ file name "${base}"`);
  if (!fm.description) out.push(`${file}: no description`);

  for (const skill of fm.skills?.items ?? []) {
    const p = path.join(ROOT, '.claude', 'skills', skill, 'SKILL.md');
    if (!existsSync(p)) out.push(`${file}: skill "${skill}" has no .claude/skills/${skill}/SKILL.md`);
    else if (/^disable-model-invocation:\s*true/m.test(readFileSync(p, 'utf8'))) {
      out.push(`${file}: skill "${skill}" has disable-model-invocation: true and cannot be preloaded`);
    }
  }

  const hookText = (fm.hooks?.raw ?? []).join('\n');
  let hasBashGuard = false;
  for (const cm of hookText.matchAll(/\$CLAUDE_PROJECT_DIR\/([^"\\\s]+)\\?"?\s*([a-z]*)/g)) {
    const rel = cm[1];
    const hookName = path.basename(rel);
    if (!existsSync(path.join(ROOT, rel))) out.push(`${file}: hook script ${rel} does not exist`);
    if (PROFILES[hookName]) {
      if (!PROFILES[hookName].includes(cm[2])) out.push(`${file}: ${hookName} has unknown profile "${cm[2]}"`);
      if (hookName === 'bash-guard.mjs') hasBashGuard = true;
    }
  }
  const tools = (fm.tools?.value ?? '').split(/,\s*/);
  if (hasBashGuard && tools.includes('PowerShell')) out.push(`${file}: bash-guard only matches Bash, but tools lists PowerShell`);
  if (hasBashGuard && !/matcher:\s*"Bash"/.test(hookText)) out.push(`${file}: bash-guard is not on a "Bash" matcher`);
  if (/write-scope\.mjs/.test(hookText) && !/matcher:\s*"Write\|Edit"/.test(hookText)) {
    out.push(`${file}: write-scope must be on the "Write|Edit" matcher`);
  }
  for (const tool of tools.filter((x) => x.startsWith('mcp__'))) {
    if (!MCP_TOOLS.has(tool)) out.push(`${file}: tools lists unknown MCP tool "${tool}" (known: ${[...MCP_TOOLS].join(', ')})`);
  }
  for (const tool of MCP_FORBIDDEN[base] ?? []) {
    if (tools.includes(tool)) out.push(`${file}: ${tool} is forbidden for ${base} (starts a paid review run)`);
  }
  return out;
}

if (MCP_TOOLS.size < 5) failures.push(`MCP tool discovery found ${MCP_TOOLS.size} tools in mcp-server/src/tools (expected ≥ 5)`);
const agentFiles = readdirSync(AGENTS).filter((f) => f.endsWith('.md') && f !== 'README.md');
for (const file of agentFiles) failures.push(...lintAgent(file, readFileSync(path.join(AGENTS, file), 'utf8')));

// lint must reject: run_agent_on_pr in spec-creator, an unknown/typo MCP tool, an unknown write-scope profile
const specText = readFileSync(path.join(AGENTS, 'spec-creator.md'), 'utf8').replace(/\r\n/g, '\n');
const lintMustFail = {
  'spec-creator + run_agent_on_pr': specText.replace(/^tools: (.*)$/m, 'tools: $1, mcp__devdigest__run_agent_on_pr'),
  'MCP tool typo': specText.replace('mcp__devdigest__get_findings', 'mcp__devdigest__get_findngs'),
  'unknown write-scope profile': specText.replace('write-scope.mjs\\" specs', 'write-scope.mjs\\" spec'),
};
for (const [label, text] of Object.entries(lintMustFail)) {
  if (text === specText) failures.push(`lint negative case "${label}": fixture did not change spec-creator.md`);
  else if (lintAgent('spec-creator.md', text).length === 0) failures.push(`lint negative case "${label}": not rejected`);
}

if (failures.length) {
  console.error(`✖ hooks self-test: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✔ hooks self-test: ${cases.length} hook cases, ${agentFiles.length} agent files, ${Object.keys(lintMustFail).length} lint negative cases`);
