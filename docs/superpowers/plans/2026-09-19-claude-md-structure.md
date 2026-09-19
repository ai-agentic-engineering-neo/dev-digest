# CLAUDE.md Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the repo exactly five CLAUDE.md files (repo root plus the roots of `server/`, `client/`, `reviewer-core/` and `e2e/`), plus per-module `docs/`, `specs/` and `INSIGHTS.md`, all linking to the existing READMEs, with a checker that keeps it true.

**Architecture:** A zero-dependency Node checker (`scripts/check-claude-md.mjs`) is the "test": it fails when a module root lacks its CLAUDE.md or required links, a link is broken, a size budget is exceeded, or a CLAUDE.md exists anywhere other than the repo root and the four module roots. Every file is hand-written; there is no generator.

**Tech Stack:** Node 20 ESM (`node:fs`, `node:path`, `node:test`), Markdown. No new dependencies.

**Spec:** the approved proposal in the conversation, amended on 2026-09-19: CLAUDE.md files exist ONLY at the repo root and at module roots, not in subfolders. No separate spec file exists.

## Global Constraints

- Modules: exactly `server`, `client`, `reviewer-core`, `e2e`.
- CLAUDE.md files: exactly `CLAUDE.md` and `<module>/CLAUDE.md` for the four modules (5 total). Any other CLAUDE.md is a violation.
- Ignored when scanning for stray CLAUDE.md: `node_modules`, `dist`, `.next`, `clones`, `coverage`, and dot-folders.
- `docs/` and `specs/` live inside each module, lowercase, each with a `README.md` index. The insights file is `INSIGHTS.md` at the module root.
- `e2e/specs/` already holds `*.flow.json` browser scenarios; it doubles as e2e's specs folder and its `README.md` indexes those files.
- Module-root CLAUDE.md is at most 60 non-empty lines; the repo-root CLAUDE.md is at most 45 (it is loaded in every session).
- A module-root CLAUDE.md must link `README.md`, `docs/README.md`, `specs/README.md` and `INSIGHTS.md` (relative, exact strings).
- CLAUDE.md links to docs and never copies them. Links are relative and must resolve.

### Content rules (from `docs/hw1/claude_philosophy.md`, `context_loading_mechanisms.md`, `devdigest_strategy.md`)

- **A map, not documentation.** Include only: stack with (major) versions, build/test commands, a top-level map, non-default conventions, gotchas, do-not-touch zones. Exclude: detailed architecture, file-by-file descriptions, standard language rules, anything a linter would catch, volatile data (lists of workflows, modules, adapters or components that change often).
- **Lazy loading, references only.** No `@import` anywhere. The repo-root file is the only always-loaded file; per-module content lives in `<module>/CLAUDE.md`, which loads when the agent works in that directory. Do not duplicate module rules in the root.
- **Placement.** Root: shared stack line (Node, pnpm, Docker, TypeScript, test runner), package table with guide links, run commands, top-level folder map, do-not-touch zones (migrations pointer, lock-files, stated once), the no-linter note, and the "Read … when …" pointers. Module root: that module's stack line, install/run commands, verify commands, naming conventions, hard rules and gotchas, "Read … when …" doc pointers, and a top-level-only folder map.
- **Pointer format.** Every reference to a doc is a directive with a trigger, for example `Read INSIGHTS.md before changing src/db.`, never a bare list of links. Each of the five files contains at least one line matching `Read … when|before …`.
- **Gotchas** live in `INSIGHTS.md`; each module root tells the agent when to read it.
- **Folder maps** list top-level folders only, one short phrase each; do not enumerate every module, adapter or component group.
- **Run commands** are the command plus a link to the README; do not narrate what a script does step by step.
- **The lock-file rule is stated once, in the repo root.** Module files do not repeat it.
- The five-file set as a whole must still cover: tech stack per package (module files), package/folder structure and roles (root table plus module folder maps), run commands (root and module Commands), verification commands with an explicit statement that no linter or formatter is configured (root and module Verify), a separate naming-conventions section per module, and do-not-touch zones for migrations and lock-files.
- Every command, port, package name and rule written in a CLAUDE.md must be verified against `package.json`, a README or the code; do not write unverified claims.
- Commit messages must NOT contain a Co-Authored-By line.
- Do not modify existing READMEs.

## Executing on the current branch

Branch `docs/claude-md-structure` was built from an earlier version of this plan that put a CLAUDE.md in every folder (109 extra files, a scaffolder and a descriptions map). On that branch:

- Tasks 2 and 5 are already done; verify, do not redo.
- Tasks 1, 3 and 4 were done against an earlier version of the content rules and must be reworked: Task 1 adds the root budget and the "Read … when" rule to the checker, Task 3 moves stack, verify and naming content into each module root and trims folder maps and doc pointers, Task 4 slims the repo root. The existing files hold verified facts (versions, scripts, conventions, lock-file list); move and shorten them, do not re-derive or drop them.
- On a fresh checkout of `main`, run all tasks in order.

## File Structure

| Path | Responsibility |
|---|---|
| `scripts/claude-md-lib.mjs` | Shared: module list, exclusion rule, stray-file finder, link extractor |
| `scripts/check-claude-md.mjs` | Validator, exits 1 with a list of violations |
| `scripts/check-claude-md.test.mjs` | `node:test` tests |
| `CLAUDE.md` | Repo root, always loaded (at most 45 lines): package table, shared stack, run, do-not-touch, "Read … when" pointers |
| `<module>/CLAUDE.md` | Module root, loaded on demand (at most 60 lines): stack, commands, verify, naming, hard rules, "Read … when" pointers, top-level folder map |
| `<module>/docs/README.md`, `<module>/specs/README.md`, `<module>/INSIGHTS.md` | Skeletons |

---

### Task 1: Shared lib and checker (the failing test)

**Files:**
- Create or replace: `scripts/claude-md-lib.mjs`
- Create or replace: `scripts/check-claude-md.mjs`
- Create or replace: `scripts/check-claude-md.test.mjs`

**Interfaces:**
- Produces from `claude-md-lib.mjs`:
  - `MODULES: string[]`
  - `isExcluded(name: string): boolean`
  - `findClaudeMd(dir: string): string[]` (absolute paths of every file named `CLAUDE.md` under `dir`, skipping excluded folders)
  - `relativeLinks(markdown: string): string[]` (relative targets, anchors stripped, http(s)/mailto skipped)
  - `contentLines(markdown: string): number` (non-empty line count)
- Produces from `check-claude-md.mjs`: `check(repoRoot: string): string[]` (violations) and a CLI that prints them and exits 1 if any.

- [ ] **Step 1: Write the failing test**

```js
// scripts/check-claude-md.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isExcluded, relativeLinks, contentLines } from './claude-md-lib.mjs';
import { check } from './check-claude-md.mjs';

const MODULES = ['server', 'client', 'reviewer-core', 'e2e'];
const MODULE_MD =
  '# m\nRead [r](README.md) when starting.\n[d](docs/README.md)\n[s](specs/README.md)\n[i](INSIGHTS.md)\n';
const ROOT_LINKS = MODULES.map((m) => `[${m}](${m}/CLAUDE.md)`).join('\n') + '\n';
const ROOT_MD = ROOT_LINKS + 'Read the module guides when working in that module.\n';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cmd-'));
  writeFileSync(join(root, 'CLAUDE.md'), ROOT_MD);
  for (const m of MODULES) {
    mkdirSync(join(root, m, 'src', 'a'), { recursive: true });
    mkdirSync(join(root, m, 'docs'));
    mkdirSync(join(root, m, 'specs'));
    writeFileSync(join(root, m, 'README.md'), '# r\n');
    writeFileSync(join(root, m, 'docs', 'README.md'), '# d\n');
    writeFileSync(join(root, m, 'specs', 'README.md'), '# s\n');
    writeFileSync(join(root, m, 'INSIGHTS.md'), '# i\n');
    writeFileSync(join(root, m, 'CLAUDE.md'), MODULE_MD);
  }
  return root;
}

test('isExcluded skips build and dot dirs', () => {
  for (const n of ['node_modules', 'dist', '.next', 'clones', 'coverage', '.git']) {
    assert.equal(isExcluded(n), true, n);
  }
  assert.equal(isExcluded('modules'), false);
});

test('relativeLinks keeps relative targets only, strips anchors', () => {
  const md = '[a](../README.md#x) [b](https://x.io) [c](docs/) [d](mailto:a@b.c)';
  assert.deepEqual(relativeLinks(md), ['../README.md', 'docs/']);
});

test('contentLines ignores blanks', () => {
  assert.equal(contentLines('a\n\n\nb\n'), 2);
});

test('a complete fixture has no violations', () => {
  assert.deepEqual(check(fixture()), []);
});

test('reports a missing repo-root CLAUDE.md', () => {
  const root = fixture();
  writeFileSync(join(root, 'CLAUDE.md'), '');
  const v = check(root);
  assert.ok(v.some((x) => x.includes('does not link server/CLAUDE.md')), v.join('\n'));
});

test('reports a module without CLAUDE.md', () => {
  const root = fixture();
  rmSync(join(root, 'client', 'CLAUDE.md'));
  assert.ok(check(root).some((x) => x.includes('client/CLAUDE.md: missing')));
});

test('reports a broken link', () => {
  const root = fixture();
  writeFileSync(join(root, 'server', 'CLAUDE.md'), MODULE_MD + '[x](nope.md)\n');
  assert.ok(check(root).some((x) => x.includes('broken link') && x.includes('nope.md')));
});

test('reports a module root that does not link INSIGHTS.md', () => {
  const root = fixture();
  writeFileSync(join(root, 'server', 'CLAUDE.md'), '# m\n[r](README.md)\n[d](docs/README.md)\n[s](specs/README.md)\n');
  assert.ok(check(root).some((x) => x.includes('server/CLAUDE.md') && x.includes('INSIGHTS.md')));
});

test('reports a module root over the 60-line budget', () => {
  const root = fixture();
  writeFileSync(join(root, 'server', 'CLAUDE.md'), MODULE_MD + 'x\n'.repeat(60));
  assert.ok(check(root).some((x) => x.includes('server/CLAUDE.md') && x.includes('> 60')));
});

test('reports a root over the 45-line budget', () => {
  const root = fixture();
  writeFileSync(join(root, 'CLAUDE.md'), ROOT_MD + 'x\n'.repeat(45));
  assert.ok(check(root).some((x) => x.startsWith('CLAUDE.md') && x.includes('> 45')));
});

test('reports a root without a "Read ... when" pointer', () => {
  const root = fixture();
  writeFileSync(join(root, 'CLAUDE.md'), ROOT_LINKS);
  assert.ok(check(root).some((x) => x.startsWith('CLAUDE.md') && x.includes('Read')));
});

test('reports a module root without a "Read ... when" pointer', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'server', 'CLAUDE.md'),
    '# m\n[r](README.md)\n[d](docs/README.md)\n[s](specs/README.md)\n[i](INSIGHTS.md)\n',
  );
  assert.ok(check(root).some((x) => x.includes('server/CLAUDE.md') && x.includes('Read')));
});

test('reports a CLAUDE.md in a subfolder', () => {
  const root = fixture();
  writeFileSync(join(root, 'server', 'src', 'a', 'CLAUDE.md'), '# stray\n');
  assert.ok(check(root).some((x) => x.includes('server/src/a/CLAUDE.md') && x.includes('stray')));
});

test('ignores CLAUDE.md inside node_modules', () => {
  const root = fixture();
  mkdirSync(join(root, 'server', 'node_modules', 'pkg'), { recursive: true });
  writeFileSync(join(root, 'server', 'node_modules', 'pkg', 'CLAUDE.md'), '# dep\n');
  assert.deepEqual(check(root), []);
});

test('reports a broken link inside a docs skeleton', () => {
  const root = fixture();
  writeFileSync(join(root, 'client', 'docs', 'README.md'), '[x](missing.md)\n');
  assert.ok(check(root).some((x) => x.includes('client/docs/README.md') && x.includes('broken link')));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/check-claude-md.test.mjs`
Expected: FAIL (`findClaudeMd` is not exported / `check` reports the wrong things).

- [ ] **Step 3: Implement the lib and checker**

```js
// scripts/claude-md-lib.mjs
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const MODULES = ['server', 'client', 'reviewer-core', 'e2e'];

const EXCLUDED = new Set(['node_modules', 'dist', '.next', 'clones', 'coverage']);

export const isExcluded = (name) => EXCLUDED.has(name) || name.startsWith('.');

export function findClaudeMd(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!isExcluded(e.name)) walk(join(d, e.name));
      } else if (e.name === 'CLAUDE.md') {
        out.push(join(d, e.name));
      }
    }
  };
  walk(dir);
  return out.sort();
}

export function relativeLinks(markdown) {
  const links = [];
  for (const m of markdown.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const t = m[1];
    if (/^(https?:|mailto:|#)/.test(t)) continue;
    links.push(t.split('#')[0]);
  }
  return links;
}

export const contentLines = (md) => md.split('\n').filter((l) => l.trim()).length;
```

```js
// scripts/check-claude-md.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULES, findClaudeMd, relativeLinks, contentLines } from './claude-md-lib.mjs';

const ROOT_FILE_BUDGET = 45;
const MODULE_BUDGET = 60;
const REQUIRED_LINKS = ['README.md', 'docs/README.md', 'specs/README.md', 'INSIGHTS.md'];
const READ_WHEN = /\bread\b[^\n]*\b(when|before)\b/i;
const READ_WHEN_MSG = 'has no "Read ... when/before ..." pointer';

export function check(repoRoot) {
  const v = [];
  const rel = (p) => relative(repoRoot, p);
  const checkLinks = (file, md) => {
    for (const l of relativeLinks(md)) {
      if (!existsSync(resolve(dirname(file), l))) v.push(`${rel(file)}: broken link ${l}`);
    }
  };

  const rootFile = join(repoRoot, 'CLAUDE.md');
  if (!existsSync(rootFile)) v.push('CLAUDE.md: missing at repo root');
  else {
    const md = readFileSync(rootFile, 'utf8');
    checkLinks(rootFile, md);
    for (const m of MODULES) {
      if (!md.includes(`${m}/CLAUDE.md`)) v.push(`CLAUDE.md: does not link ${m}/CLAUDE.md`);
    }
    if (!READ_WHEN.test(md)) v.push(`CLAUDE.md: ${READ_WHEN_MSG}`);
    const n = contentLines(md);
    if (n > ROOT_FILE_BUDGET) v.push(`CLAUDE.md: ${n} lines > ${ROOT_FILE_BUDGET}`);
  }

  const allowed = new Set([rootFile, ...MODULES.map((m) => join(repoRoot, m, 'CLAUDE.md'))]);

  for (const m of MODULES) {
    const modDir = join(repoRoot, m);
    for (const f of ['README.md', 'INSIGHTS.md', 'docs/README.md', 'specs/README.md']) {
      const p = join(modDir, f);
      if (!existsSync(p)) v.push(`${m}/${f}: missing`);
      else checkLinks(p, readFileSync(p, 'utf8'));
    }

    const file = join(modDir, 'CLAUDE.md');
    if (!existsSync(file)) v.push(`${m}/CLAUDE.md: missing`);
    else {
      const md = readFileSync(file, 'utf8');
      checkLinks(file, md);
      const links = new Set(relativeLinks(md));
      for (const need of REQUIRED_LINKS) {
        if (!links.has(need)) v.push(`${m}/CLAUDE.md: does not link ${need}`);
      }
      if (!READ_WHEN.test(md)) v.push(`${m}/CLAUDE.md: ${READ_WHEN_MSG}`);
      const n = contentLines(md);
      if (n > MODULE_BUDGET) v.push(`${m}/CLAUDE.md: ${n} lines > ${MODULE_BUDGET}`);
    }

    for (const f of findClaudeMd(modDir)) {
      if (!allowed.has(f)) {
        v.push(`${rel(f)}: stray CLAUDE.md (only the repo root and module roots may have one)`);
      }
    }
  }
  return v;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const v = check(repoRoot);
  if (v.length) { console.error(v.join('\n') + `\n\n${v.length} violation(s)`); process.exit(1); }
  console.log('CLAUDE.md structure OK');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test scripts/check-claude-md.test.mjs`
Expected: PASS, 15 tests

- [ ] **Step 5: Run the checker on the real repo**

Run: `node scripts/check-claude-md.mjs`
Expected on a fresh checkout of `main`: exit 1 listing the missing root and module CLAUDE.md files and skeletons. On the current branch: exit 1 listing the stray per-folder CLAUDE.md files (removed in Task 5).

- [ ] **Step 6: Commit**

```bash
git add scripts/claude-md-lib.mjs scripts/check-claude-md.mjs scripts/check-claude-md.test.mjs
git commit -m "chore(docs): add CLAUDE.md structure checker"
```

---

### Task 2: Module skeletons (docs, specs, INSIGHTS) for all four modules

**Files:**
- Create for each `<m>` in `server client reviewer-core e2e`: `<m>/docs/README.md`, `<m>/specs/README.md`, `<m>/INSIGHTS.md`

**Interfaces:**
- Produces: the files the module-root CLAUDE.md (Task 3) links to.

- [ ] **Step 1: Write `docs/README.md`** (replace `<m>` with the module name)

```markdown
# <m> docs

Durable explanations of how `<m>` works. Link to existing material instead of copying it.

| Doc | What it covers |
|---|---|
| [../README.md](../README.md) | Module overview (source of truth) |
```

Extra rows to append per module:
- `server`: `[repo-intel](../src/modules/repo-intel/README.md) | Indexer pipeline`, `[TESTING](../../TESTING.md) | Test strategy`
- `reviewer-core`: `[Pipeline](../README.md#pipeline) | Review pipeline`
- `e2e`: `[TESTING](../../TESTING.md) | Test strategy`
- `client`: none.

- [ ] **Step 2: Write `specs/README.md`** (for `e2e`, see the note below)

```markdown
# <m> specs

One file per feature or lesson (`L01-<slug>.md` ... `L08-<slug>.md`). Index them here.

## Template

    # <Title>
    ## What to build
    ## Acceptance criteria
    - [ ] ...
    ## Touches
    Folders or docs that must be updated.

## Index

_None yet._
```

`e2e/specs/` already holds `NN-name.flow.json` scenarios. Do not move them. Keep the template and make the Index list each existing file as a link with a short phrase taken from that file's `name` field.

- [ ] **Step 3: Write `INSIGHTS.md`**

```markdown
# <m> insights

Append-only. One dated bullet per non-obvious fact: what, why it matters, where it applies.

_No entries yet._
```

For `server`, replace the last line with two bullets:

```markdown
- 2026-09-19: Migrations are not run on boot; run them explicitly. Applies to `src/db`.
- 2026-09-19: An unindexed repo silently degrades to diff-only review. Applies to `src/modules/repo-intel`, `src/modules/reviews`.
```

- [ ] **Step 4: Verify**

Run: `node scripts/check-claude-md.mjs 2>&1 | grep -E "INSIGHTS|docs/README|specs/README"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add server/docs server/specs server/INSIGHTS.md client/docs client/specs client/INSIGHTS.md reviewer-core/docs reviewer-core/specs reviewer-core/INSIGHTS.md e2e/docs e2e/specs/README.md e2e/INSIGHTS.md
git commit -m "docs: add docs/specs/INSIGHTS skeletons to each module"
```

---

### Task 3: Module-root CLAUDE.md (hand-written, four files)

**Files:**
- Create or rewrite: `server/CLAUDE.md`, `client/CLAUDE.md`, `reviewer-core/CLAUDE.md`, `e2e/CLAUDE.md`

**Interfaces:**
- Consumes: the skeletons from Task 2.

- [ ] **Step 1: Write `server/CLAUDE.md`** (template; the other three follow the same sections)

```markdown
# server (@devdigest/api)

Fastify 5 API on port 3001. Stack: TypeScript ESM, Fastify 5, Drizzle ORM + drizzle-kit, postgres, Zod, Vitest + Testcontainers (read each item from `package.json`; major versions only).

## Commands
Install with the lockfile's manager, then the real script names from `package.json` (dev, build, start, db:generate, db:migrate, db:seed). Command plus link only; no narration.

## Verify
`typecheck` and `test` exactly as in `package.json`; a full `pnpm test` includes `*.it.test.ts` and needs Docker; the hermetic-only command as `README.md` words it. There is no linter or formatter; do not add a lint command.

## Naming conventions
Only conventions confirmed in this module's code (test suffixes and locations, module folders and file roles, mock doubles, migration names).

## Hard rules and gotchas
- `*.it.test.ts` are DB-backed (testcontainers); everything else is hermetic.
- Route schemas are Zod contracts from `@devdigest/shared`; do not redefine them locally.
- Feature modules are registered statically in `src/modules/index.ts`; adapters are injected via `src/platform/container.ts`.
- Migrations are not run on boot.
- DO NOT TOUCH `src/db/migrations/` (generated by drizzle-kit; change `src/db/schema.ts`, then `db:generate` and `db:migrate`).
- `src/vendor/` holds vendored copies of shared contracts; no sync script exists, so do not edit them here.

## Read when
- Read [README](README.md) when changing routes, environment or the request/DI flow.
- Read [docs](docs/README.md) when you need how-it-works detail; it links the indexer README and [TESTING](../TESTING.md).
- Read [specs](specs/README.md) when starting a lesson or feature.
- Read [INSIGHTS](INSIGHTS.md) before changing `src/db` or `src/modules/repo-intel`.
- Read the [root README](../README.md) when setting up the whole project.

## Folder map
Top-level `src/` folders only, one short phrase each, plus `test/`. No per-module, per-adapter or per-file lists (link a README instead).
```

Fill each file from facts you read, not guessed. The existing files on the current branch already hold verified versions, commands and conventions: move and shorten them, do not drop them.
- Stack and commands: `package.json` (`node -e "console.log(require('./<m>/package.json'))"`) and the module README. Use the package manager that matches the lockfile (`pnpm-lock.yaml` vs `package-lock.json`).
- Verify: the module's real `typecheck` and `test` scripts. State the no-linter fact only after confirming no `lint` script and no eslint, prettier or biome config or dependency exists.
- Naming conventions: only what you confirm in that module's code. Client: PascalCase `_components/<Name>/` folders with same-named file, `index.ts` and colocated `*.test.tsx`, kebab-case shared containers, `[param]` route folders, `useXxx.ts` hooks, per-area kebab files in `src/lib/hooks/`, `messages/en/<feature>.json`. e2e: `specs/NN-name.flow.json`. reviewer-core: whatever `src/` and `test/` show.
- Read when: one trigger per doc, phrased "Read X when/before ...". Never a bare link list; the four required links (`README.md`, `docs/README.md`, `specs/README.md`, `INSIGHTS.md`) appear inside these lines. Extra docs (TESTING, root README, the repo-intel README, `reviewer-core/README.md#pipeline`) get a trigger too.
- Module-specific rules: `client` is Next.js 15 on port 3000 and user-visible strings go through `src/i18n` / `messages/en`; `reviewer-core` is a pure engine with an injected LLM and is consumed as TS source through a path alias; `e2e` runs deterministic agent-browser flows and needs the stack running (see its README), and `specs/` holds its `*.flow.json` scenarios.
- Folder map: `ls` each top-level folder and read a file or two before writing its phrase; at most about ten lines. Do not enumerate modules, adapters or components.
- Do not repeat the lock-file rule; it lives in the repo root only.
- Do not write "fetch mocked" or any other claim you have not confirmed in `client/src/test`, the README or the code.

- [ ] **Step 2: Run the checker**

Run: `node scripts/check-claude-md.mjs`
Expected: no violations other than the repo-root file (if Task 4 is not done yet) and any stray files (removed in Task 5).

- [ ] **Step 3: Commit**

```bash
git add server/CLAUDE.md client/CLAUDE.md reviewer-core/CLAUDE.md e2e/CLAUDE.md
git commit -m "docs: add module-root CLAUDE.md files"
```

---

### Task 4: Repo-root CLAUDE.md and checker docs

**Files:**
- Create: `CLAUDE.md`
- Modify: `TESTING.md` (add the checker command)

- [ ] **Step 1: Write `CLAUDE.md`** (at most 45 non-empty lines)

```markdown
# DevDigest

Local-first AI PR-review tool. Four standalone packages (no workspace root; each has its own package.json and lockfile). Cross-package sharing is via tsconfig path aliases.

| Module | Role | Guide |
|---|---|---|
| server | Fastify API, DB, indexer (port 3001) | [server/CLAUDE.md](server/CLAUDE.md) |
| client | Next.js UI (port 3000) | [client/CLAUDE.md](client/CLAUDE.md) |
| reviewer-core | Pure review engine | [reviewer-core/CLAUDE.md](reviewer-core/CLAUDE.md) |
| e2e | Browser tests | [e2e/CLAUDE.md](e2e/CLAUDE.md) |

## Stack
One shared line, from the READMEs and package.json files: Node and pnpm minimums, Docker for Postgres, TypeScript with `strict`, Vitest. Per-package stack, verify commands and naming conventions live in each module's CLAUDE.md.

## Top-level map
`scripts/`, `docs/`, `.claude/skills/`, `docker-compose.yml`, `skills-lock.json`: one short phrase each. No workflow or file lists.

## Run
- Whole project: `./scripts/dev.sh` (flags and details in the [README](README.md)).
- Manual: the commands from the README quick start, one line.

## Verify
Run the module's own commands (see its CLAUDE.md), then `node scripts/check-claude-md.mjs`. There is no linter or formatter configured; do not add or invent a lint command.

## Do not touch
- Migrations: `server/src/db/migrations/` is generated; see [server/CLAUDE.md](server/CLAUDE.md).
- Lock-files: the real list from `git ls-files | grep -i lock`. Never edit by hand, never delete and regenerate; change them only through the package's own manager (pnpm in server and client, npm in reviewer-core and e2e); never mix managers. State what `skills-lock.json` records only if the repo shows it.

## Read when
- Read `<module>/CLAUDE.md` before editing that module.
- Read `<module>/INSIGHTS.md` before changing an area it lists (gotchas).
- Read [README](README.md) when setting up or when you need the architecture diagram.
- Read [TESTING](TESTING.md) when adding tests, touching CI or running the checker.
- Read [agent prompts](docs/agent-prompts/README.md) when editing reviewer prompts.
- Read [skills](.claude/skills/README.md) when adding or changing a skill.
```

- [ ] **Step 2: Document the checker and the maintenance rules in `TESTING.md`**

Read the file, then next to the other repo-level commands add `node scripts/check-claude-md.mjs` with a comment that it is run from the repo root (valid when pasted from the repo root; do not restructure the file), plus these rules in two or three lines: only the repo root and the four module roots have a CLAUDE.md; link to docs, never copy them; when a module's folders, commands or rules change, update its CLAUDE.md in the same change.

- [ ] **Step 3: Verify**

Run: `node --test scripts/check-claude-md.test.mjs && node scripts/check-claude-md.mjs`
Expected: `CLAUDE.md structure OK` (on the current branch, only after Task 5).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md TESTING.md
git commit -m "docs: add root CLAUDE.md and document the structure checker"
```

---

### Task 5: Remove the per-folder artifacts (current branch only)

Skip this task on a fresh checkout of `main`.

**Files:**
- Delete: every `CLAUDE.md` except the repo root and the four module roots
- Delete: `scripts/scaffold-claude-md.mjs`, `scripts/claude-md-descriptions.json`
- Modify: `CLAUDE.md`, `TESTING.md`, and the module roots, to drop references to per-folder files and the scaffolder

- [ ] **Step 1: Confirm the checker fails on the stray files**

Run: `node scripts/check-claude-md.mjs 2>&1 | grep -c "stray CLAUDE.md"`
Expected: `109`

- [ ] **Step 2: Delete the per-folder files and the scaffolder**

```bash
git ls-files '*CLAUDE.md' | grep -vE '^(CLAUDE\.md|(server|client|reviewer-core|e2e)/CLAUDE\.md)$' | xargs git rm -q
git rm -q scripts/scaffold-claude-md.mjs scripts/claude-md-descriptions.json
```

- [ ] **Step 3: Remove leftover references**

Run: `grep -rnE "scaffold-claude-md|claude-md-descriptions|own CLAUDE.md|per-folder|parent folder" CLAUDE.md TESTING.md server/CLAUDE.md client/CLAUDE.md reviewer-core/CLAUDE.md e2e/CLAUDE.md`
Edit each hit so it no longer mentions the scaffolder, descriptions map or per-folder CLAUDE.md files. Fold any per-folder descriptions worth keeping into each module's Folder map (Task 3) instead of losing them.

- [ ] **Step 4: Verify**

Run: `node --test scripts/check-claude-md.test.mjs && node scripts/check-claude-md.mjs && git ls-files '*CLAUDE.md' | wc -l`
Expected: 15 tests pass, `CLAUDE.md structure OK`, and `5`.

- [ ] **Step 5: Commit**

```bash
git commit -m "docs: keep CLAUDE.md only at repo root and module roots"
```

---

## Self-Review

- **Coverage:** only root plus module-root CLAUDE.md (Tasks 3, 4, enforced by the checker's stray-file rule); README links and "Read … when" pointers (Task 3, enforced by the checker); Docs, Specs, Insights (Task 2); removal of the earlier per-folder work (Task 5); the three `docs/hw1` documents (Global Constraints, "Content rules"): map not documentation, lazy loading with no `@import`, per-module rules kept out of the root, directive-style pointers, gotchas via INSIGHTS.md, no volatile lists.
- **Placeholders:** the only judgment-driven content is each module's commands, rules, naming conventions and folder map; Task 3 names the source of every fact and forbids unverified claims.
- **Consistency:** `findClaudeMd`, `relativeLinks`, `contentLines`, `isExcluded` and `MODULES` are defined in Task 1 and used with the same signatures in the checker and tests. The 45/60-line budgets, the four required link strings and the "Read … when/before" rule are identical in Global Constraints, the checker and the tests (15 tests).
- **Known limits:** the checker enforces presence, links, budgets and the pointer format, not that a file's claims stay true or that content stays lean; that stays a review responsibility (see the rules in `TESTING.md`). CI wiring is not part of this plan.
- **Strategy doc aligned (outside this plan):** `docs/hw1/devdigest_strategy.md` named paths that do not exist here (`docs/architecture.md`, `apps/server/README.md`, `LEARNINGS.md`); it now points at the root `README.md` (architecture diagram), `reviewer-core/README.md#pipeline`, `server/README.md`, `<module>/CLAUDE.md` and `<module>/INSIGHTS.md`. `INSIGHTS.md` is the per-module lessons file.
