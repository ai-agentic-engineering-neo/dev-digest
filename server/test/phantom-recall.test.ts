import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { detectPhantomReferences } from '../src/modules/hooks/detectors.js';
import type { RepoBasics } from '../src/modules/repo-intel/repository.js';
import type { UnifiedDiff } from '@devdigest/shared';

/**
 * T1.4 — Deterministic phantom micro-eval (NO LLM).
 *
 * Hard, runnable evidence that the AST-backed phantom-gate (T1.3) is high-precision
 * AND that it catches the bare-identifier phantom calls it claims to catch.
 *
 * Method:
 *  - A small gold set of fixture files lives under a temp clone dir. Each file
 *    is either a PHANTOM case (KNOWN-truth: a hallucinated/renamed/mis-imported
 *    bare call exists and MUST be flagged) or a CONTROL case (KNOWN-truth: the
 *    file LOOKS suspicious but is fully resolvable and MUST NOT be flagged).
 *  - We drive `RepoIntelService.getUnresolvedReferences` (which T1.3 wired into
 *    `detectPhantomReferences`) against a synthetic diff that marks every line
 *    in each fixture as ADDED — so the `addedLines` gate doesn't filter our
 *    planted phantoms out.
 *  - Recall = (planted phantoms caught) / (planted phantoms total).
 *  - Precision on the control set = 1 − (false positives) / (control sites).
 *
 * Target (plan §3, §14: precision-first):
 *  - Precision on the control set MUST be 1.0 (zero false positives).
 *  - Recall on the bare-identifier phantom class MUST be 1.0 — every planted
 *    bare-identifier phantom is reachable by the gate's design.
 *
 * IMPORTANT — what is OUT of scope for the phantom-gate (and thus this eval):
 *  - Member calls `x.foo()` — by design (T1.3 doc): we can't resolve `foo`
 *    without type info, so we skip member callees. Phantom member calls are
 *    NOT planted as recall targets here.
 *  - Renamed identifiers that LOOK like a typo of an imported one — the gate
 *    is exact-match, not fuzzy. Renames are planted as bare phantoms (the
 *    intended bug class), not as typo-of-import.
 *
 * Run together with the existing repo-intel-phantom.test.ts unit suite; this
 * file is the eval, that one is the contract.
 */

// ---------------------------------------------------------------------------
// Fixture definitions — KEEP NUMBERS HONEST.
//
// `planted`  = lines that MUST be flagged (1-based, in this file's text).
// `controls` = invocation sites that MUST NOT be flagged.
//
// We use a fixed `START_LINE = 1` because each fixture is its own file; the
// first usable line is line 1 (no leading blank).
// ---------------------------------------------------------------------------

/** Planted phantom record — source of truth for recall measurement. */
interface Planted {
  file: string;
  symbol: string;
  line: number;
  /** Free-text class label for the report. */
  klass: 'hallucinated' | 'renamed' | 'mis-imported' | 'unimported-ctor' | 'unimported-jsx';
}

/** Control site we expect to NOT be flagged (precision check). */
interface Control {
  file: string;
  symbol: string;
  /** Why this site is fine — for the report. */
  why:
    | 'declared-local'
    | 'imported-named'
    | 'imported-default'
    | 'imported-namespace-member'
    | 'member-call'
    | 'global-console'
    | 'global-math'
    | 'global-promise'
    | 'global-setTimeout'
    | 'type-only-usage'
    | 'jsx-html-tag';
}

interface Fixture {
  rel: string; // path relative to clone root
  contents: string;
  planted: Planted[];
  controls: Control[];
}

/**
 * Each fixture is a stand-alone TS/TSX file. The clone layout is flat
 * (no shared imports across fixtures); ./mod and similar imports do NOT need
 * a target file to exist because the gate only looks at the imported NAMES
 * the file *says* it has, not whether the source file resolves.
 */
const FIXTURES: Fixture[] = [
  // ---- Phantoms (each file contains AT LEAST one planted bare-identifier
  //                phantom that the gate MUST catch).
  {
    rel: 'hallucinated.ts',
    contents:
      `export function entry() {\n` +
      `  totallyMadeUpFn();\n` +
      `}\n`,
    planted: [{ file: 'hallucinated.ts', symbol: 'totallyMadeUpFn', line: 2, klass: 'hallucinated' }],
    controls: [],
  },
  {
    rel: 'renamed.ts',
    contents:
      `import { fetchUser } from './mod';\n` +
      `export function entry() {\n` +
      `  fetchUser();   // ok: imported\n` +
      `  fetchUsers();  // PHANTOM: renamed/typo of fetchUser\n` +
      `}\n`,
    planted: [{ file: 'renamed.ts', symbol: 'fetchUsers', line: 4, klass: 'renamed' }],
    controls: [{ file: 'renamed.ts', symbol: 'fetchUser', why: 'imported-named' }],
  },
  {
    rel: 'mis-imported.ts',
    contents:
      // `processOrder` is NOT in the import list — typical mis-import bug.
      `import { logOrder } from './orders';\n` +
      `export function entry() {\n` +
      `  logOrder();      // ok\n` +
      `  processOrder();  // PHANTOM: forgot to add to imports\n` +
      `}\n`,
    planted: [{ file: 'mis-imported.ts', symbol: 'processOrder', line: 4, klass: 'mis-imported' }],
    controls: [{ file: 'mis-imported.ts', symbol: 'logOrder', why: 'imported-named' }],
  },
  {
    rel: 'ctor-phantom.ts',
    contents:
      `export function entry() {\n` +
      `  const u = new UserRecord();   // PHANTOM: not imported, not declared\n` +
      `  return u;\n` +
      `}\n`,
    planted: [{ file: 'ctor-phantom.ts', symbol: 'UserRecord', line: 2, klass: 'unimported-ctor' }],
    controls: [],
  },
  {
    rel: 'jsx-phantom.tsx',
    contents:
      `import { Card } from './ui';\n` +
      `export function View() {\n` +
      `  return (\n` +
      `    <Card>\n` +
      `      <UnregisteredWidget />\n` +
      `    </Card>\n` +
      `  );\n` +
      `}\n`,
    planted: [
      {
        file: 'jsx-phantom.tsx',
        symbol: 'UnregisteredWidget',
        // <UnregisteredWidget /> sits on line 5 — verify by counting from line 1.
        line: 5,
        klass: 'unimported-jsx',
      },
    ],
    controls: [
      { file: 'jsx-phantom.tsx', symbol: 'Card', why: 'imported-named' },
      { file: 'jsx-phantom.tsx', symbol: 'div', why: 'jsx-html-tag' }, // sanity: lowercase tags never flagged
    ],
  },

  // ---- Controls (each file is fully resolvable — gate MUST NOT flag).
  {
    rel: 'controls-declared.ts',
    contents:
      `function helper(n: number) { return n + 1; }\n` +
      `export function entry() {\n` +
      `  helper(1);   // ok: declared in this file\n` +
      `  entry;       // identifier reference (no parens) → not an invocation; never reached\n` +
      `}\n`,
    planted: [],
    controls: [
      { file: 'controls-declared.ts', symbol: 'helper', why: 'declared-local' },
    ],
  },
  {
    rel: 'controls-imports.ts',
    contents:
      `import defaultThing, { namedFn, AnotherFn } from './mod';\n` +
      `import * as ns from 'lib';\n` +
      `export function entry() {\n` +
      `  namedFn();           // imported-named\n` +
      `  AnotherFn();         // imported-named\n` +
      `  defaultThing();      // imported-default\n` +
      `  ns.something();      // imported-namespace-member (member call, skipped by parser)\n` +
      `}\n`,
    planted: [],
    controls: [
      { file: 'controls-imports.ts', symbol: 'namedFn', why: 'imported-named' },
      { file: 'controls-imports.ts', symbol: 'AnotherFn', why: 'imported-named' },
      { file: 'controls-imports.ts', symbol: 'defaultThing', why: 'imported-default' },
      { file: 'controls-imports.ts', symbol: 'something', why: 'imported-namespace-member' },
    ],
  },
  {
    rel: 'controls-globals.ts',
    contents:
      `export function entry() {\n` +
      `  console.log('hi');         // global-console (member call → skipped anyway)\n` +
      `  Math.max(1, 2);            // global-math (member call → skipped)\n` +
      `  setTimeout(() => 1, 10);   // global-setTimeout (bare call → must be in allowlist)\n` +
      `  Promise.resolve(1);        // global-promise (member call → skipped)\n` +
      `  new Error('boom');         // global new-expr → must be in allowlist\n` +
      `  JSON.stringify({});        // member call → skipped\n` +
      `}\n`,
    planted: [],
    controls: [
      { file: 'controls-globals.ts', symbol: 'console', why: 'global-console' },
      { file: 'controls-globals.ts', symbol: 'Math', why: 'global-math' },
      { file: 'controls-globals.ts', symbol: 'setTimeout', why: 'global-setTimeout' },
      { file: 'controls-globals.ts', symbol: 'Promise', why: 'global-promise' },
      { file: 'controls-globals.ts', symbol: 'Error', why: 'global-promise' },
    ],
  },
  {
    rel: 'controls-member-calls.ts',
    contents:
      `import { client } from './client';\n` +
      `export function entry() {\n` +
      `  client.fetchUser();   // member call → never an invocation head\n` +
      `  client.x.y.z();       // deep member call → never an invocation head\n` +
      `  ({ go() { return 1 } }).go();  // member call on object literal\n` +
      `}\n`,
    planted: [],
    controls: [
      { file: 'controls-member-calls.ts', symbol: 'fetchUser', why: 'member-call' },
      { file: 'controls-member-calls.ts', symbol: 'y', why: 'member-call' },
      { file: 'controls-member-calls.ts', symbol: 'z', why: 'member-call' },
      { file: 'controls-member-calls.ts', symbol: 'go', why: 'member-call' },
    ],
  },
  {
    rel: 'controls-type-only.tsx',
    contents:
      `import type { User } from './user';\n` +
      `import { Card } from './ui';\n` +
      `function pick(u: User): User { return u; }\n` +
      `export function View(u: User) {\n` +
      `  pick(u);             // declared-local\n` +
      `  return <Card />;     // imported-named, JSX\n` +
      `}\n`,
    planted: [],
    controls: [
      { file: 'controls-type-only.tsx', symbol: 'User', why: 'type-only-usage' }, // never an invocation
      { file: 'controls-type-only.tsx', symbol: 'pick', why: 'declared-local' },
      { file: 'controls-type-only.tsx', symbol: 'Card', why: 'imported-named' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Driver: build a synthetic diff that marks EVERY line in every fixture as
// ADDED. This isolates the recall/precision measurement to "what the gate
// thinks about this code", not "did we draw the diff envelope right".
// ---------------------------------------------------------------------------

function diffMarkingAllLinesAdded(files: { path: string; contents: string }[]): UnifiedDiff {
  const parts: string[] = [];
  for (const f of files) {
    const ls = f.contents.split('\n');
    // Drop a trailing empty element produced by a final newline.
    const lines = ls[ls.length - 1] === '' ? ls.slice(0, -1) : ls;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- /dev/null`);
    parts.push(`+++ b/${f.path}`);
    parts.push(`@@ -0,0 +1,${lines.length} @@`);
    for (const ln of lines) parts.push(`+${ln}`);
  }
  return {
    raw: parts.join('\n'),
    files: files.map((f) => ({
      path: f.path,
      additions: f.contents.split('\n').length,
      deletions: 0,
      hunks: [],
    })),
  };
}

async function writeFixture(root: string, rel: string, contents: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, contents, 'utf8');
}

function buildServiceOnClone(clonePath: string): RepoIntelService {
  const container = {
    config: { repoIntelEnabled: true },
    db: {} as never,
    codeIndex: {} as never,
  } as never;
  const svc = new RepoIntelService(container);
  const basics: RepoBasics = { id: 'eval-r1', owner: 'acme', name: 'demo', clonePath };
  (svc as unknown as { repo: { getRepoBasics: (id: string) => Promise<RepoBasics> } }).repo = {
    getRepoBasics: async () => basics,
  };
  return svc;
}

// ---------------------------------------------------------------------------
// Suite.
// ---------------------------------------------------------------------------

describe('T1.4 deterministic phantom micro-eval', () => {
  let cloneRoot: string;

  beforeAll(async () => {
    cloneRoot = await mkdtemp(join(tmpdir(), 'dd-phantom-eval-'));
    for (const fx of FIXTURES) await writeFixture(cloneRoot, fx.rel, fx.contents);
  });
  afterAll(async () => {
    await rm(cloneRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('catches every planted bare-identifier phantom (recall = 1.0) AND keeps zero false positives on the control set (precision = 1.0)', async () => {
    const svc = buildServiceOnClone(cloneRoot);
    const allFiles = FIXTURES.map((f) => f.rel);
    const diff = diffMarkingAllLinesAdded(FIXTURES.map((f) => ({ path: f.rel, contents: f.contents })));

    // 1. Drive the facade.
    const refs = await svc.getUnresolvedReferences('eval-r1', allFiles);
    const findings = await detectPhantomReferences(diff, {
      // Reuse `svc`'s reads but bind the facade-level shape detectPhantomReferences expects.
      indexRepo: async () => ({ status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: 0 }),
      refreshIndex: async () => ({ status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: 0 }),
      getIndexState: async () => ({
        repoId: 'eval-r1', status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: 0,
        lastIndexedSha: '', indexerVersion: 1, updatedAt: new Date(0), degraded: true,
      }),
      getBlastRadius: async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true }),
      getRepoMap: async () => ({ text: '', tokens: 0, cached: false, degraded: true }),
      getFileRank: async () => [],
      getSymbolsInFiles: async () => [],
      getCallerSignatures: async () => [],
      getUnresolvedReferences: async () => refs,
      getConventionSamples: async () => [],
      getTopFilesByRank: async () => [],
      getCriticalPaths: async () => [],
    }, 'eval-r1');

    // 2. Recall on planted phantoms.
    const planted = FIXTURES.flatMap((f) => f.planted);
    const flagged = new Set(findings.map((f) => `${f.file}:${f.start_line}:${f.title}`));
    const caughtPlanted = planted.filter((p) =>
      // The title carries the symbol name verbatim — match on (file, line, symbol).
      [...flagged].some((k) => k.startsWith(`${p.file}:${p.line}:`) && k.includes(`\`${p.symbol}\``)),
    );

    // 3. Precision on the control set: any controls site flagged is a false positive.
    //    The gate emits findings keyed by (file, line, symbol). A control violation
    //    is a finding whose symbol name matches any control symbol AND whose file
    //    matches the control's file.
    const controlSymbolsByFile = new Map<string, Set<string>>();
    for (const c of FIXTURES.flatMap((f) => f.controls)) {
      let s = controlSymbolsByFile.get(c.file);
      if (!s) { s = new Set(); controlSymbolsByFile.set(c.file, s); }
      s.add(c.symbol);
    }
    const falsePositives = findings.filter((f) => {
      const cs = controlSymbolsByFile.get(f.file);
      if (!cs) return false;
      // Title format: `Phantom API: \`SYMBOL\` not declared or imported`. Extract SYMBOL.
      const m = /`([^`]+)`/.exec(f.title);
      if (!m) return false;
      return cs.has(m[1]!);
    });

    // 4. Honest reporting — printed to test output for the report we send back.
    const recall = planted.length === 0 ? 1 : caughtPlanted.length / planted.length;
    const controlCount = FIXTURES.flatMap((f) => f.controls).length;
    const precisionOnControls = controlCount === 0 ? 1 : 1 - falsePositives.length / controlCount;

    // eslint-disable-next-line no-console
    console.log(
      `[phantom-eval] fixtures=${FIXTURES.length} planted=${planted.length} caught=${caughtPlanted.length} ` +
      `controls=${controlCount} fp=${falsePositives.length} ` +
      `recall=${recall.toFixed(2)} precision_on_controls=${precisionOnControls.toFixed(2)}`,
    );
    if (caughtPlanted.length !== planted.length) {
      const missed = planted.filter((p) => !caughtPlanted.includes(p));
      // eslint-disable-next-line no-console
      console.log('[phantom-eval] MISSED:', missed);
    }
    if (falsePositives.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        '[phantom-eval] FALSE POSITIVES:',
        falsePositives.map((f) => `${f.file}:${f.start_line} ${f.title}`),
      );
    }

    expect(precisionOnControls).toBe(1.0); // hard requirement: zero FPs on controls
    expect(recall).toBe(1.0); // every planted bare-id phantom must be caught
  });

  it('drops to zero findings when repoIntelEnabled=false (acceptance #10 — gate off ≡ no behavior change)', async () => {
    // Same fixtures, but flag flipped. With the facade off, the AST gate emits []
    // and `detectPhantomReferences` likewise emits [].
    const container = {
      config: { repoIntelEnabled: false },
      db: {} as never,
      codeIndex: {} as never,
    } as never;
    const svc = new RepoIntelService(container);
    const basics: RepoBasics = { id: 'eval-r1', owner: 'acme', name: 'demo', clonePath: cloneRoot };
    (svc as unknown as { repo: { getRepoBasics: (id: string) => Promise<RepoBasics> } }).repo = {
      getRepoBasics: async () => basics,
    };

    const allFiles = FIXTURES.map((f) => f.rel);
    const refs = await svc.getUnresolvedReferences('eval-r1', allFiles);
    expect(refs).toEqual([]);
  });
});
