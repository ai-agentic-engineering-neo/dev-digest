import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseInvocationHeads } from '../src/adapters/astgrep/index.js';
import { detectPhantomReferences } from '../src/modules/hooks/detectors.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { RepoBasics } from '../src/modules/repo-intel/repository.js';
import type { RepoIntel, RefRow } from '../src/modules/repo-intel/types.js';
import type { UnifiedDiff } from '@devdigest/shared';

/**
 * T1.3 — Phantom-API gate (Docker-free).
 *
 * Covers:
 *  1) parseInvocationHeads — bare-identifier invocation heads only
 *  2) getUnresolvedReferences — declared OR imported OR global → not flagged;
 *     truly hallucinated calls → flagged
 *  3) detectPhantomReferences — emits kind:'phantom' only when the unresolved
 *     ref's line is in the added-line set of the diff
 */

// ---------------------------------------------------------------------------
// 1) parseInvocationHeads — pure, no fs.
// ---------------------------------------------------------------------------

describe('parseInvocationHeads', () => {
  it('captures bare identifier calls, new-exprs, and JSX, skipping member calls + HTML tags', () => {
    const src = `
import { rateLimit, Bucket, Widget } from './mw';
export function handler(req) {
  if (!rateLimit(req)) return 429;           // bare call → captured
  const b = new Bucket();                     // new-expr → captured
  obj.compute(1);                             // member call → SKIPPED
  someThing.x.y();                            // member call → SKIPPED
  return <Widget id={1} />;                   // capitalized JSX → captured
}
export const A = () => <div>x</div>;          // lowercase HTML → SKIPPED
`;
    const heads = parseInvocationHeads('src/h.tsx', src);
    const names = heads.map((h) => h.name).sort();

    expect(names).toContain('rateLimit');
    expect(names).toContain('Bucket');
    expect(names).toContain('Widget');
    expect(names).not.toContain('compute');
    expect(names).not.toContain('y');
    expect(names).not.toContain('div');

    const rate = heads.find((h) => h.name === 'rateLimit');
    expect(rate?.kind).toBe('call');
    expect(rate?.line).toBe(4);
    expect(heads.find((h) => h.name === 'Bucket')?.kind).toBe('new');
    expect(heads.find((h) => h.name === 'Widget')?.kind).toBe('jsx');
  });

  it('does NOT capture identifiers inside import statements', () => {
    const src = `import { foo } from './x';\nfoo();\n`;
    const heads = parseInvocationHeads('src/a.ts', src);
    // Only the `foo()` call on line 2 should be captured.
    expect(heads.filter((h) => h.name === 'foo')).toHaveLength(1);
    expect(heads.find((h) => h.name === 'foo')?.line).toBe(2);
  });

  it('returns [] for unsupported file extensions', () => {
    expect(parseInvocationHeads('src/x.py', 'def foo(): pass')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2) RepoIntelService.getUnresolvedReferences (clone-on-disk, no db).
// ---------------------------------------------------------------------------

/**
 * Build a RepoIntelService whose `repo` (RepoIntelRepository) is patched to
 * return a fixed RepoBasics — keeps the test off Postgres. Everything else
 * goes through the real service.
 */
function buildServiceOnClone(
  clonePath: string,
  opts: { flag: boolean } = { flag: true },
): RepoIntelService {
  const container = {
    config: { repoIntelEnabled: opts.flag },
    db: {} as never,
    codeIndex: {} as never,
  } as never;
  const svc = new RepoIntelService(container);
  const basics: RepoBasics = {
    id: 'r1',
    owner: 'acme',
    name: 'demo',
    clonePath,
  };
  // Patch the private repo so we don't hit the DB.
  (svc as unknown as { repo: { getRepoBasics: (id: string) => Promise<RepoBasics> } }).repo = {
    getRepoBasics: async (_id: string) => basics,
  };
  return svc;
}

async function writeFileMkdir(root: string, rel: string, content: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, 'utf8');
}

describe('RepoIntelService.getUnresolvedReferences', () => {
  let cloneRoot: string;
  beforeAll(async () => {
    cloneRoot = await mkdtemp(join(tmpdir(), 'dd-phantom-'));
  });
  afterAll(async () => {
    await rm(cloneRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('returns [] when the feature flag is off', async () => {
    await writeFileMkdir(
      cloneRoot,
      'flag-off.ts',
      `totallyMadeUpFn();\n`,
    );
    const svc = buildServiceOnClone(cloneRoot, { flag: false });
    const refs = await svc.getUnresolvedReferences('r1', ['flag-off.ts']);
    expect(refs).toEqual([]);
  });

  it('does NOT flag declared / imported / global / member-call sites', async () => {
    const src = `
import { fromMod } from './mod';
import * as ns from 'lib';

export function localDecl(x: number) { return x; }

export function entry() {
  localDecl(1);            // (a) declared in this file → NOT flagged
  fromMod();               // (b) imported binding → NOT flagged
  ns.something();          // member call → NOT flagged
  console.log('hi');       // global → NOT flagged
  Math.max(1, 2);          // global ctor as base → NOT flagged
  obj.doThing();           // (d) member call → NOT flagged
}
`;
    await writeFileMkdir(cloneRoot, 'safe.ts', src);
    const svc = buildServiceOnClone(cloneRoot);
    const refs = await svc.getUnresolvedReferences('r1', ['safe.ts']);
    expect(refs).toEqual([]);
  });

  it('flags a call to a symbol that is neither declared nor imported nor global', async () => {
    const src = `
import { okFn } from './ok';
export function entry() {
  okFn();
  console.log('warm-up');
  totallyMadeUpFn();   // (e) phantom — neither declared, imported, nor global
}
`;
    await writeFileMkdir(cloneRoot, 'phantom.ts', src);
    const svc = buildServiceOnClone(cloneRoot);
    const refs = await svc.getUnresolvedReferences('r1', ['phantom.ts']);
    expect(refs.length).toBe(1);
    const r = refs[0]!;
    expect(r.symbolName).toBe('totallyMadeUpFn');
    expect(r.refFile).toBe('phantom.ts');
    expect(r.declFile).toBeNull(); // T1: ephemeral, no persistent decl_file
    // Line of the phantom call inside `phantom.ts`.
    expect(r.refLine).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// 3) detectPhantomReferences — emits Finding[] only for ADDED-line phantoms.
// ---------------------------------------------------------------------------

/** Tiny stub RepoIntel that returns a canned RefRow[] — no clone needed. */
function stubRepoIntelWithRefs(refs: RefRow[]): RepoIntel {
  return {
    async indexRepo() { return { status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: 0 }; },
    async refreshIndex() { return { status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: 0 }; },
    async getIndexState(repoId: string) {
      return {
        repoId, status: 'degraded',
        filesIndexed: 0, filesSkipped: 0, durationMs: 0,
        lastIndexedSha: '', indexerVersion: 1, updatedAt: new Date(0),
        degraded: true,
      };
    },
    async getBlastRadius() {
      return { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true };
    },
    async getRepoMap() {
      return { text: '', tokens: 0, cached: false, degraded: true };
    },
    async getFileRank() { return []; },
    async getSymbolsInFiles() { return []; },
    async getCallerSignatures() { return []; },
    async getUnresolvedReferences() { return refs; },
    async getConventionSamples() { return []; },
    async getTopFilesByRank() { return []; },
    async getCriticalPaths() { return []; },
  };
}

/** Minimal unified-diff factory: one added line at `newLine` in `file`. */
function diffWithAddedLine(file: string, newLine: number, text: string): UnifiedDiff {
  const raw =
    `diff --git a/${file} b/${file}\n` +
    `--- a/${file}\n` +
    `+++ b/${file}\n` +
    `@@ -${newLine},0 +${newLine},1 @@\n` +
    `+${text}\n`;
  return {
    raw,
    files: [{ path: file, additions: 1, deletions: 0, hunks: [] }],
  };
}

describe('detectPhantomReferences', () => {
  it('emits kind:phantom only for unresolved refs whose line is in the ADDED set', async () => {
    const diff = diffWithAddedLine('src/x.ts', 5, 'totallyMadeUpFn();');
    const stub = stubRepoIntelWithRefs([
      // (a) phantom on an ADDED line → SHOULD be flagged
      { refFile: 'src/x.ts', refLine: 5, symbolName: 'totallyMadeUpFn', declFile: null },
      // (b) phantom on a non-added line → should be IGNORED (pre-existing)
      { refFile: 'src/x.ts', refLine: 99, symbolName: 'ancientGhost', declFile: null },
      // (c) phantom in a file not in the diff → ignored
      { refFile: 'src/other.ts', refLine: 5, symbolName: 'farAway', declFile: null },
    ]);
    const findings = await detectPhantomReferences(diff, stub, 'r1');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.kind).toBe('phantom');
    expect(findings[0]!.file).toBe('src/x.ts');
    expect(findings[0]!.start_line).toBe(5);
    expect(findings[0]!.title).toContain('totallyMadeUpFn');
  });

  it('emits [] when the facade returns []', async () => {
    const diff = diffWithAddedLine('src/x.ts', 1, 'foo();');
    const stub = stubRepoIntelWithRefs([]);
    const findings = await detectPhantomReferences(diff, stub, 'r1');
    expect(findings).toEqual([]);
  });

  it('never throws when the facade throws', async () => {
    const diff = diffWithAddedLine('src/x.ts', 1, 'foo();');
    const broken: RepoIntel = {
      ...stubRepoIntelWithRefs([]),
      async getUnresolvedReferences() {
        throw new Error('boom');
      },
    };
    const findings = await detectPhantomReferences(diff, broken, 'r1');
    expect(findings).toEqual([]);
  });
});
