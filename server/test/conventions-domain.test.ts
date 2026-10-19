import { describe, it, expect, vi } from 'vitest';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import {
  ConventionDomainError,
  isStaleRunning,
  locateQuote,
  safeRepoPath,
  verifyEvidence,
  type RawCandidate,
} from '../src/modules/conventions/domain.js';
import { ConventionsService } from '../src/modules/conventions/service.js';
import { MAX_CANDIDATES } from '../src/modules/conventions/constants.js';
import type {
  ConventionRecord,
  ConventionStore,
  NewConvention,
  RepoBasics,
  ScanRecord,
} from '../src/modules/conventions/ports.js';
import type { RepoRef, StructuredRequest } from '@devdigest/shared';

/**
 * L02 — the conventions evidence gate: the model only proposes, a candidate
 * survives only when its quoted line really is in a repo file (near the cited
 * line), and sampling is code-only (configs + top-ranked files).
 */

const USERS_TS = [
  "import { db } from '../db';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  const posts = await db.posts.findMany({ userId: id });',
  '  return { user, posts };',
  '}',
].join('\n');

const raw = (over: Partial<RawCandidate> = {}): RawCandidate => ({
  category: 'style',
  rule: 'Use async/await instead of .then() chains',
  evidence_path: 'src/api/users.ts',
  line: 4,
  quote: 'const user = await db.users.find(id);',
  confidence: 0.9,
  ...over,
});

const FILES = new Map([['src/api/users.ts', USERS_TS]]);

describe('conventions domain — verifyEvidence', () => {
  it('keeps a candidate whose quote is on the cited line and cuts the snippet from the file', () => {
    const [c] = verifyEvidence([raw()], FILES);
    expect(c).toMatchObject({ evidencePath: 'src/api/users.ts', evidenceLine: 4, confidence: 0.9 });
    expect(c!.evidenceSnippet).toContain('const user = await db.users.find(id);');
    expect(c!.evidenceSnippet.startsWith('export async function getUser')).toBe(true);
  });

  it('re-anchors the line when the quote is within the tolerance, ignoring whitespace', () => {
    const [c] = verifyEvidence([raw({ line: 6, quote: '  const   user = await db.users.find(id);' })], FILES);
    expect(c?.evidenceLine).toBe(4);
  });

  it('drops a candidate whose file does not exist or whose quote is not in the file', () => {
    expect(verifyEvidence([raw({ evidence_path: 'src/missing.ts' })], FILES)).toEqual([]);
    expect(verifyEvidence([raw({ quote: 'db.users.find(id).then((u) => u)' })], FILES)).toEqual([]);
  });

  it('drops a quote that exists but far from the cited line', () => {
    expect(verifyEvidence([raw({ line: 40 })], FILES)).toEqual([]);
  });

  it('drops a trivial quote and an empty rule', () => {
    expect(verifyEvidence([raw({ quote: '}' })], FILES)).toEqual([]);
    expect(verifyEvidence([raw({ rule: '   ' })], FILES)).toEqual([]);
  });

  it('clamps confidence, dedupes by rule (highest wins) and caps the list', () => {
    const out = verifyEvidence(
      [raw({ confidence: 1.7 }), raw({ rule: 'use ASYNC/await instead of .then() chains', confidence: 0.4 })],
      FILES,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.confidence).toBe(1);

    const many = Array.from({ length: MAX_CANDIDATES + 5 }, (_, i) => raw({ rule: `rule ${i}`, confidence: i / 100 }));
    const capped = verifyEvidence(many, FILES);
    expect(capped).toHaveLength(MAX_CANDIDATES);
    expect(capped[0]!.rule).toBe(`rule ${MAX_CANDIDATES + 4}`);
  });

  it('rejects paths that escape the clone', () => {
    expect(safeRepoPath('../etc/passwd')).toBeNull();
    expect(safeRepoPath('/etc/passwd')).toBeNull();
    expect(safeRepoPath('src/../../x')).toBeNull();
    expect(safeRepoPath('C:\\x')).toBeNull();
    expect(safeRepoPath('./src/a.ts')).toBe('src/a.ts');
    const files = new Map([['../secret', 'const user = await db.users.find(id);']]);
    expect(verifyEvidence([raw({ evidence_path: '../secret', line: 1 })], files)).toEqual([]);
  });

  it('locateQuote prefers the nearest matching line', () => {
    const lines = ['a = 1;', 'x = call();', 'b = 2;', 'x = call();'];
    expect(locateQuote(lines, 4, 'x = call();')).toBe(3);
    expect(locateQuote(lines, 1, 'x = call();')).toBe(1);
  });

  it('treats a long-running scan as stale', () => {
    const startedAt = new Date('2026-10-19T10:00:00Z');
    expect(isStaleRunning({ status: 'running', startedAt }, new Date('2026-10-19T10:30:00Z'), 600_000)).toBe(true);
    expect(isStaleRunning({ status: 'running', startedAt }, new Date('2026-10-19T10:05:00Z'), 600_000)).toBe(false);
    expect(isStaleRunning({ status: 'done', startedAt }, new Date('2026-10-19T12:00:00Z'), 600_000)).toBe(false);
  });
});

// ------------------------------------------------------------ service (in-memory)

class MemoryStore implements ConventionStore {
  scans: ScanRecord[] = [];
  items: ConventionRecord[] = [];
  constructor(private repo: RepoBasics | undefined) {}
  async getRepo() {
    return this.repo;
  }
  async latestScan() {
    return this.scans.at(-1);
  }
  async createScan(_ws: string, repoId: string) {
    const s: ScanRecord = {
      id: `scan-${this.scans.length + 1}`,
      repoId,
      status: 'running',
      filesSampled: 0,
      error: null,
      startedAt: new Date(),
      finishedAt: null,
    };
    this.scans.push(s);
    return s;
  }
  async failScan(id: string, error: string) {
    Object.assign(this.scans.find((s) => s.id === id)!, { status: 'failed', error });
  }
  async completeScan(workspaceId: string, repoId: string, id: string, filesSampled: number, items: NewConvention[]) {
    this.items = items.map((i, n) => ({ ...i, id: `c${n}`, workspaceId, repoId, status: 'pending' as const }));
    Object.assign(this.scans.find((s) => s.id === id)!, { status: 'done', filesSampled });
  }
  async list() {
    return this.items;
  }
  async update() {
    return undefined;
  }
  async resolvePending() {
    return 0;
  }
}

const REPO: RepoBasics = { id: 'r1', owner: 'acme', name: 'payments-api', clonePath: '/clones/acme/payments-api' };

function makeService(opts: {
  repo?: RepoBasics;
  samples?: string[];
  files?: Record<string, string>;
  llm?: MockLLMProvider;
}) {
  const store = new MemoryStore('repo' in opts ? opts.repo : REPO);
  const llm =
    opts.llm ??
    new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
          conventions: [
            raw(),
            raw({ rule: 'Invented rule', quote: 'this line does not exist anywhere' }),
          ],
        },
      },
    });
  const files = opts.files ?? { 'src/api/users.ts': USERS_TS, 'tsconfig.json': '{ "compilerOptions": { "strict": true } }' };
  const read = vi.fn(async (_r: RepoRef, p: string) => {
    if (!(p in files)) throw new Error('ENOENT');
    return files[p]!;
  });
  const service = new ConventionsService({
    store,
    samples: { getConventionSamples: async () => opts.samples ?? ['src/api/users.ts'] },
    files: { readFile: read },
    resolveModel: async () => ({ llm, model: 'gpt-test' }),
  });
  return { service, store, llm, read };
}

describe('conventions service — extract', () => {
  it('samples configs + top files, calls the model once and keeps only verified candidates', async () => {
    const { service, store, llm } = makeService({});
    const scan = await service.extract('ws', 'r1');
    expect(scan?.status).toBe('running');
    await vi.waitFor(() => expect(store.scans[0]!.status).toBe('done'));

    expect(store.items.map((i) => i.rule)).toEqual(['Use async/await instead of .then() chains']);
    expect(store.scans[0]!.filesSampled).toBe(2);

    const calls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(calls).toHaveLength(1);
    const req = calls[0]!.req as StructuredRequest<unknown>;
    const user = req.messages.find((m) => m.role === 'user')!.content as string;
    expect(user).toContain('<untrusted source="tsconfig.json">');
    expect(user).toContain('4| ' + '  const user = await db.users.find(id);');
  });

  it('refuses a second extraction while one is running', async () => {
    const { service, store } = makeService({});
    await store.createScan('ws', 'r1');
    await expect(service.extract('ws', 'r1')).rejects.toMatchObject({ code: 'extract_in_progress' });
  });

  it('refuses an uncloned repo and a repo with no source samples', async () => {
    await expect(makeService({ repo: { ...REPO, clonePath: null } }).service.extract('ws', 'r1')).rejects.toBeInstanceOf(
      ConventionDomainError,
    );
    await expect(makeService({ samples: [] }).service.extract('ws', 'r1')).rejects.toMatchObject({
      code: 'repo_not_indexed',
    });
  });

  it('returns undefined for an unknown repo', async () => {
    expect(await makeService({ repo: undefined }).service.extract('ws', 'nope')).toBeUndefined();
  });

  it('reads files the model cites outside the sample, never unsafe paths', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
          conventions: [
            raw({ evidence_path: 'src/lib/redis.ts', line: 1, quote: 'export const redis = new Redis(url);' }),
            raw({ rule: 'escape', evidence_path: '../../etc/passwd', line: 1, quote: 'root:x:0:0' }),
          ],
        },
      },
    });
    const { service, store, read } = makeService({
      llm,
      files: { 'src/api/users.ts': USERS_TS, 'src/lib/redis.ts': 'export const redis = new Redis(url);' },
    });
    await service.extract('ws', 'r1');
    await vi.waitFor(() => expect(store.scans[0]!.status).toBe('done'));
    expect(store.items.map((i) => i.evidencePath)).toEqual(['src/lib/redis.ts']);
    expect(read.mock.calls.map((c) => c[1])).not.toContain('../../etc/passwd');
  });

  it('marks the scan failed when the model call throws', async () => {
    const llm = new MockLLMProvider('openai', {});
    vi.spyOn(llm, 'completeStructured').mockRejectedValue(new Error('rate limited'));
    const { service, store } = makeService({ llm });
    await service.extract('ws', 'r1');
    await vi.waitFor(() => expect(store.scans[0]!.status).toBe('failed'));
    expect(store.scans[0]!.error).toBe('rate limited');
  });
});
