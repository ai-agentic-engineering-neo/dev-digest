import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Container } from '../src/platform/container.js';
import { NotFoundError, ValidationError } from '../src/platform/errors.js';
import type { ContextRepoRef, ContextRepositoryPort } from '../src/modules/context/ports.js';
import { ProjectContextService } from '../src/modules/context/service.js';

const WS = 'ws-1';
const AGENT = 'agent-1';
const REPO: ContextRepoRef = { id: 'repo-1', owner: 'acme', name: 'api', clonePath: '/clones/acme/api' };

const text = (tokens: number) => 'x'.repeat(tokens * 4);

class FakeContextRepo implements ContextRepositoryPort {
  repos = new Map<string, ContextRepoRef>([[REPO.id, REPO]]);
  agents = new Set([AGENT]);
  links = new Map<string, string[]>();
  counts = new Map<string, number>();
  async repoInWorkspace(ws: string, repoId: string) {
    return ws === WS ? this.repos.get(repoId) : undefined;
  }
  async agentInWorkspace(ws: string, agentId: string) {
    return ws === WS && this.agents.has(agentId);
  }
  async listAttachments(agentId: string, repoId: string) {
    return [...(this.links.get(`${agentId}/${repoId}`) ?? [])];
  }
  async replaceAttachments(agentId: string, repoId: string, paths: string[]) {
    this.links.set(`${agentId}/${repoId}`, [...paths]);
  }
  async attachedAgentCounts() {
    return this.counts;
  }
}

let files: Record<string, string>;
let walked: string[];
let contextRepo: FakeContextRepo;
let getIndexState: ReturnType<typeof vi.fn>;
let readFile: ReturnType<typeof vi.fn>;
let service: ProjectContextService;

beforeEach(() => {
  files = {
    'README.md': '# Root\n',
    'docs/a.md': text(10),
    'specs/b.md': text(20),
    'client/INSIGHTS.md': text(3),
    'src/app.ts': 'secret()',
    '.env.md': 'x',
  };
  walked = ['.env.md', 'README.md', 'client/INSIGHTS.md', 'docs/a.md', 'specs/b.md'];
  contextRepo = new FakeContextRepo();
  getIndexState = vi.fn(async () => ({ status: 'full' }));
  readFile = vi.fn(async (_repo: unknown, path: string) => {
    if (!(path in files)) throw new Error('ENOENT');
    return files[path]!;
  });
  const container = {
    contextRepo,
    docWalker: { listMarkdown: async () => walked },
    git: { readFile },
    repoIntel: { getIndexState },
  } as unknown as Container;
  service = new ProjectContextService(container);
});

describe('listDocs (AC-1, AC-5)', () => {
  it('lists classifying docs with tokens and attached counts', async () => {
    contextRepo.counts = new Map([['docs/a.md', 2]]);
    const list = await service.listDocs(WS, REPO.id);
    expect(list.state).toEqual({ status: 'ready' });
    expect(list.docs).toEqual([
      { path: 'README.md', source: 'readme', tokens: 2, attached_agents: 0 },
      { path: 'client/INSIGHTS.md', source: 'insights', tokens: 3, attached_agents: 0 },
      { path: 'docs/a.md', source: 'docs', tokens: 10, attached_agents: 2 },
      { path: 'specs/b.md', source: 'specs', tokens: 20, attached_agents: 0 },
    ]);
  });

  it('drops a doc whose read fails', async () => {
    delete files['specs/b.md'];
    const list = await service.listDocs(WS, REPO.id);
    expect(list.docs.map((d) => d.path)).not.toContain('specs/b.md');
  });

  it('not cloned → not_cloned with no docs, and the index state is not read', async () => {
    contextRepo.repos.set(REPO.id, { ...REPO, clonePath: null });
    const list = await service.listDocs(WS, REPO.id);
    expect(list).toEqual({ repo_id: REPO.id, state: { status: 'not_cloned' }, docs: [] });
    expect(getIndexState).not.toHaveBeenCalled();
  });

  it('a failed index labels the list but keeps every doc', async () => {
    getIndexState.mockResolvedValue({ status: 'failed', reason: 'boom' });
    const list = await service.listDocs(WS, REPO.id);
    expect(list.state).toEqual({ status: 'index_failed', reason: 'boom' });
    expect(list.docs).toHaveLength(4);
  });

  it('a degraded index (incl. synthesised no_data) labels the list but keeps every doc', async () => {
    getIndexState.mockResolvedValue({ status: 'degraded', degraded: true, degradedReason: 'no_data' });
    const list = await service.listDocs(WS, REPO.id);
    expect(list.state).toEqual({ status: 'index_degraded', reason: 'no_data' });
    expect(list.docs).toHaveLength(4);

    getIndexState.mockResolvedValue({ status: 'full', degraded: true });
    expect((await service.listDocs(WS, REPO.id)).state).toEqual({ status: 'index_degraded', reason: null });
  });

  it('an index-state error falls back to ready with the list', async () => {
    getIndexState.mockRejectedValue(new Error('db down'));
    const list = await service.listDocs(WS, REPO.id);
    expect(list.state).toEqual({ status: 'ready' });
    expect(list.docs).toHaveLength(4);
  });

  it('a repo outside the workspace → NotFoundError', async () => {
    await expect(service.listDocs('other-ws', REPO.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('getDoc (AC-2, security)', () => {
  it('returns a discovered doc even when the index failed', async () => {
    getIndexState.mockResolvedValue({ status: 'failed', reason: 'boom' });
    const doc = await service.getDoc(WS, REPO.id, 'docs/a.md');
    expect(doc).toMatchObject({ path: 'docs/a.md', source: 'docs', tokens: 10, content: text(10) });
  });

  it('refuses non-docs, traversal and undiscovered docs', async () => {
    files['docs/x.md'] = 'hidden';
    for (const p of ['../.env', 'src/app.ts', 'docs/x.md', '.env.md']) {
      await expect(service.getDoc(WS, REPO.id, p), p).rejects.toBeInstanceOf(NotFoundError);
    }
    expect(readFile).not.toHaveBeenCalledWith(expect.anything(), 'src/app.ts');
    expect(readFile).not.toHaveBeenCalledWith(expect.anything(), '../.env');
  });

  it('refuses everything when the repo is not cloned', async () => {
    contextRepo.repos.set(REPO.id, { ...REPO, clonePath: null });
    await expect(service.getDoc(WS, REPO.id, 'docs/a.md')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('setAgentDocs / getAgentDocs (AC-6, AC-10, AC-13)', () => {
  it('stores the order and reports each doc', async () => {
    const res = await service.setAgentDocs(WS, AGENT, REPO.id, ['specs/b.md', 'docs/a.md']);
    expect(res.docs).toEqual([
      { path: 'specs/b.md', position: 0, status: 'ok', source: 'specs', tokens: 20 },
      { path: 'docs/a.md', position: 1, status: 'ok', source: 'docs', tokens: 10 },
    ]);
    expect(await contextRepo.listAttachments(AGENT, REPO.id)).toEqual(['specs/b.md', 'docs/a.md']);
  });

  it('rejects duplicates and non-doc paths', async () => {
    await expect(service.setAgentDocs(WS, AGENT, REPO.id, ['docs/a.md', 'docs/a.md'])).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(service.setAgentDocs(WS, AGENT, REPO.id, ['src/a.ts'])).rejects.toBeInstanceOf(ValidationError);
    expect(contextRepo.links.size).toBe(0);
  });

  it('unknown agent or repo → NotFoundError', async () => {
    await expect(service.setAgentDocs(WS, 'nope', REPO.id, [])).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.setAgentDocs(WS, AGENT, 'nope', [])).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.getAgentDocs('other-ws', AGENT, REPO.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('marks a deleted doc missing, and every doc missing without a clone', async () => {
    await service.setAgentDocs(WS, AGENT, REPO.id, ['docs/a.md', 'docs/gone.md']);
    const res = await service.getAgentDocs(WS, AGENT, REPO.id);
    expect(res.docs[1]).toEqual({ path: 'docs/gone.md', position: 1, status: 'missing', source: null, tokens: null });

    contextRepo.repos.set(REPO.id, { ...REPO, clonePath: null });
    const noClone = await service.getAgentDocs(WS, AGENT, REPO.id);
    expect(noClone.docs.every((d) => d.status === 'missing')).toBe(true);
  });
});

describe('forRun (AC-8 – AC-11)', () => {
  it('no attachments → null', async () => {
    expect(await service.forRun(WS, REPO, AGENT, [])).toBeNull();
  });

  it('no clone → unavailable trace', async () => {
    await contextRepo.replaceAttachments(AGENT, REPO.id, ['docs/a.md']);
    const ctx = await service.forRun(WS, { ...REPO, clonePath: null }, AGENT, []);
    expect(ctx).toEqual({
      specs: [],
      trace: { status: 'unavailable', reason: 'repo_not_synced', attached: ['docs/a.md'] },
      logLine: 'project context unavailable: repo not synced',
    });
  });

  it('includes whole docs in order and reports missing / too-large ones; index state is ignored', async () => {
    files['docs/a.md'] = text(1000);
    files['docs/big.md'] = text(5000);
    walked.push('docs/big.md');
    getIndexState.mockResolvedValue({ status: 'degraded', degraded: true, degradedReason: 'no_data' });
    await contextRepo.replaceAttachments(AGENT, REPO.id, ['docs/a.md', 'docs/gone.md', 'docs/big.md']);

    const ctx = await service.forRun(WS, REPO, AGENT, ['docs/a.md', 'src/x.ts']);

    expect(ctx!.specs).toEqual([`### docs/a.md\n\n${text(1000)}`]);
    expect(ctx!.trace).toEqual({
      status: 'ok',
      cap_tokens: 4000,
      total_tokens: 1000,
      included: [{ path: 'docs/a.md', tokens: 1000 }],
      left_out: [
        { path: 'docs/gone.md', tokens: null, reason: 'missing' },
        { path: 'docs/big.md', tokens: 5000, reason: 'too_large' },
      ],
      changed_by_pr: ['docs/a.md'],
    });
    expect(ctx!.logLine).toBe('Project context: 1 of 3 doc(s) included (~1000 tokens); 2 left out');
    expect(getIndexState).not.toHaveBeenCalled();
  });

  it('never reads an attached doc the walker did not discover (e.g. an in-clone symlink) — it is missing', async () => {
    // readable through git.readFile, but skipped by the walker (symlinks are not listed)
    files['docs/link.md'] = 'target of an in-clone symlink';
    await contextRepo.replaceAttachments(AGENT, REPO.id, ['docs/a.md', 'docs/link.md']);

    const ctx = await service.forRun(WS, REPO, AGENT, []);

    expect(ctx!.specs).toEqual([`### docs/a.md\n\n${text(10)}`]);
    expect(ctx!.trace).toMatchObject({
      status: 'ok',
      included: [{ path: 'docs/a.md', tokens: 10 }],
      left_out: [{ path: 'docs/link.md', tokens: null, reason: 'missing' }],
    });
    expect(readFile).not.toHaveBeenCalledWith(expect.anything(), 'docs/link.md');
  });

  it('counts doc content only against the cap: two 2,000-token docs are both included (SPEC-04 AC-12)', async () => {
    files['docs/a.md'] = text(2000); // 8,000 chars
    files['specs/b.md'] = text(2000);
    await contextRepo.replaceAttachments(AGENT, REPO.id, ['docs/a.md', 'specs/b.md']);

    const ctx = await service.forRun(WS, REPO, AGENT, []);

    expect(ctx!.specs).toEqual([`### docs/a.md\n\n${text(2000)}`, `### specs/b.md\n\n${text(2000)}`]);
    // the rendered entries are longer than 16,000 chars (4,000 tokens), yet nothing is left out
    expect(ctx!.specs.join('').length).toBeGreaterThan(16_000);
    expect(ctx!.trace).toMatchObject({ status: 'ok', total_tokens: 4000, left_out: [] });
  });
});
