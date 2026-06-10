import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { HooksService } from '../src/modules/hooks/service.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { RepoBasics } from '../src/modules/repo-intel/repository.js';
import type { Container } from '../src/platform/container.js';
import type { UnifiedDiff, Finding } from '@devdigest/shared';

/**
 * T1.4 — Phantom end-to-end through HooksService.scan (no DB, no Docker).
 *
 * Verifies the WIRING that T1.3 lands in HooksService:
 *   - when REPO_INTEL_ENABLED=true AND `which.phantom !== false`:
 *       HooksService.scan emits a `kind:'phantom'` finding from
 *       detectPhantomReferences (over the AST gate fuel).
 *   - when REPO_INTEL_ENABLED=false (default): the same scan produces ZERO
 *       phantom-from-references findings (regex-only phantoms still possible
 *       but our fixture avoids those triggers).
 *
 * To stay Docker-free we mock `container.reviewRepo` (the only DB-bound
 * dependency HooksService uses) and `container.git` (so `loadDiff` returns
 * our synthetic UnifiedDiff). `container.repoIntel` is the REAL T1 service
 * pointed at a temp clone — that's the actual unit under test.
 */

// --- helpers ---------------------------------------------------------------

async function writeFixture(root: string, rel: string, contents: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, contents, 'utf8');
}

interface MockHandles {
  insertedFindings: Finding[];
  insertedReviewSummary: string | null;
}

function buildContainer(opts: {
  clonePath: string;
  flag: boolean;
  diff: UnifiedDiff;
}): { container: Container; handles: MockHandles } {
  const handles: MockHandles = { insertedFindings: [], insertedReviewSummary: null };

  // Stub reviewRepo: just enough surface for HooksService.scan + loadDiff fallback.
  const reviewRepo = {
    getPull: async () => ({
      id: 'pr-1',
      workspaceId: 'ws-1',
      repoId: 'r-1',
      number: 1,
      title: 'fixture',
      author: 'tester',
      branch: 'feat/x',
      base: 'main',
      headSha: 'abc1234',
      lastReviewedSha: null,
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: null,
      openedAt: null,
      updatedAt: null,
    }),
    getRepo: async () => ({
      id: 'r-1',
      workspaceId: 'ws-1',
      owner: 'acme',
      name: 'demo',
      fullName: 'acme/demo',
      defaultBranch: 'main',
      clonePath: opts.clonePath,
      lastPolledAt: null,
      createdBy: null,
      createdAt: new Date(0),
    }),
    getPrFiles: async () => [], // empty → loadDiff falls through to git.diff
    insertReview: async (values: { summary: string }) => {
      handles.insertedReviewSummary = values.summary;
      return { id: 'review-1' };
    },
    insertFindings: async (_reviewId: string, findings: Finding[]) => {
      handles.insertedFindings = findings;
      return findings.map((f, i) => ({
        id: `f-${i}`,
        severity: f.severity,
        category: f.category,
        title: f.title,
        file: f.file,
        startLine: f.start_line,
        endLine: f.end_line,
        rationale: f.rationale,
        suggestion: f.suggestion,
        confidence: f.confidence,
        kind: f.kind,
      }));
    },
  } as unknown as Container['reviewRepo'];

  // Stub git.diff to return our synthetic UnifiedDiff. (loadDiff calls
  // git.diff first; on empty files[] it falls back to prFiles.patch.)
  const git = {
    diff: async () => opts.diff,
  } as unknown as Container['git'];

  // Real RepoIntelService pointed at clonePath. config.repoIntelEnabled drives
  // the flag behavior we want to exercise.
  const repoIntelContainer = {
    config: { repoIntelEnabled: opts.flag },
    db: {} as never,
    codeIndex: {} as never,
  } as never;
  const repoIntel = new RepoIntelService(repoIntelContainer);
  const basics: RepoBasics = { id: 'r-1', owner: 'acme', name: 'demo', clonePath: opts.clonePath };
  (repoIntel as unknown as { repo: { getRepoBasics: (id: string) => Promise<RepoBasics> } }).repo = {
    getRepoBasics: async () => basics,
  };

  const container = {
    reviewRepo,
    git,
    repoIntel,
  } as unknown as Container;
  return { container, handles };
}

function diffMarkingAdded(file: string, contents: string): UnifiedDiff {
  const ls = contents.split('\n');
  const lines = ls[ls.length - 1] === '' ? ls.slice(0, -1) : ls;
  const parts: string[] = [];
  parts.push(`diff --git a/${file} b/${file}`);
  parts.push(`--- /dev/null`);
  parts.push(`+++ b/${file}`);
  parts.push(`@@ -0,0 +1,${lines.length} @@`);
  for (const ln of lines) parts.push(`+${ln}`);
  return {
    raw: parts.join('\n'),
    files: [{ path: file, additions: lines.length, deletions: 0, hunks: [] }],
  };
}

// --- suite -----------------------------------------------------------------

const PHANTOM_FILE = 'src/api/public.ts';
const PHANTOM_SRC =
  `import { ok } from './ok';\n` +
  `export function handler() {\n` +
  `  ok();\n` +
  `  totallyMadeUpFn();   // phantom: not declared, not imported, not global\n` +
  `}\n`;

describe('HooksService.scan — phantom-from-references wiring (no DB)', () => {
  let cloneRoot: string;

  beforeAll(async () => {
    cloneRoot = await mkdtemp(join(tmpdir(), 'dd-hooks-e2e-'));
    await writeFixture(cloneRoot, PHANTOM_FILE, PHANTOM_SRC);
  });
  afterAll(async () => {
    await rm(cloneRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('flag ON → HooksService emits a kind:"phantom" finding for the unresolved call', async () => {
    const diff = diffMarkingAdded(PHANTOM_FILE, PHANTOM_SRC);
    const { container, handles } = buildContainer({ clonePath: cloneRoot, flag: true, diff });
    const svc = new HooksService(container);

    const result = await svc.scan('ws-1', 'pr-1', { phantom: true, secret: false });

    expect(result.findings.length).toBeGreaterThan(0);
    const phantoms = result.findings.filter((f) => f.kind === 'phantom');
    expect(phantoms.length).toBeGreaterThan(0);

    // The specific phantom symbol must surface in at least one finding title.
    expect(phantoms.some((f) => f.title.includes('totallyMadeUpFn'))).toBe(true);
    // File + line locate the call site (line 4 in PHANTOM_SRC).
    const fp = phantoms.find((f) => f.title.includes('totallyMadeUpFn'))!;
    expect(fp.file).toBe(PHANTOM_FILE);
    expect(fp.start_line).toBe(4);

    // The summary line surfaces the kind.
    expect(handles.insertedReviewSummary).toMatch(/phantom/);
  });

  it('flag OFF → HooksService emits ZERO phantom-from-references findings', async () => {
    const diff = diffMarkingAdded(PHANTOM_FILE, PHANTOM_SRC);
    const { container } = buildContainer({ clonePath: cloneRoot, flag: false, diff });
    const svc = new HooksService(container);

    const result = await svc.scan('ws-1', 'pr-1', { phantom: true, secret: false });

    // The AST-backed phantom gate must produce nothing when flag=false. Regex
    // PHANTOM_RULES may still fire on legacy markers; this fixture intentionally
    // has none (no `TODO`, no `not implemented`, no `from 'fake-…'`), so the
    // total findings count is 0.
    const phantomRefFindings = result.findings.filter(
      (f) => f.kind === 'phantom' && f.title.includes('not declared or imported'),
    );
    expect(phantomRefFindings).toHaveLength(0);
  });

  it('flag ON + which.phantom = false → ZERO phantom findings (caller-controlled gate)', async () => {
    const diff = diffMarkingAdded(PHANTOM_FILE, PHANTOM_SRC);
    const { container } = buildContainer({ clonePath: cloneRoot, flag: true, diff });
    const svc = new HooksService(container);

    const result = await svc.scan('ws-1', 'pr-1', { phantom: false, secret: false });

    // When phantom scanning is disabled at the call site, the wiring MUST NOT
    // run detectPhantomReferences either — this is the contract guarding the
    // hooks-route caller from accidentally re-enabling the AST gate.
    expect(result.findings.filter((f) => f.kind === 'phantom')).toHaveLength(0);
  });
});
