import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Container } from '../src/platform/container.js';
import { NotFoundError, ValidationError } from '../src/platform/errors.js';
import type {
  ContextRepoRef,
  ContextRepositoryPort,
  DevdigestDocRecord,
  DevdigestDocsRepositoryPort,
} from '../src/modules/context/ports.js';
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
  /** rows already in the order the SQL returns (enabled agents only, name/id/position). */
  enabledRows: { agentId: string; path: string }[] = [];
  async listEnabledAgentAttachments(ws: string, repoId: string) {
    return ws === WS && repoId === REPO.id ? [...this.enabledRows] : [];
  }
}

class FakeDevdigestDocsRepo implements DevdigestDocsRepositoryPort {
  docs: (DevdigestDocRecord & { ws: string })[] = [];
  /** agent id -> attached "repoId/path" keys, to model detach + used_by */
  agents = new Map<string, { name: string; attached: Set<string> }>();
  private seq = 0;
  private strip(d: DevdigestDocRecord & { ws: string }): DevdigestDocRecord {
    const { ws: _ws, ...rest } = d;
    return rest;
  }
  async listByRepo(ws: string, repoId: string) {
    return this.docs
      .filter((d) => d.ws === ws && d.repoId === repoId)
      .sort((a, b) => (a.path < b.path ? -1 : 1))
      .map((d) => this.strip(d));
  }
  async getById(ws: string, id: string) {
    const d = this.docs.find((x) => x.ws === ws && x.id === id);
    return d ? this.strip(d) : undefined;
  }
  async getByPaths(ws: string, repoId: string, paths: readonly string[]) {
    return this.docs
      .filter((d) => d.ws === ws && d.repoId === repoId && paths.includes(d.path))
      .map((d) => this.strip(d));
  }
  async countByRepo(ws: string, repoId: string) {
    return this.docs.filter((d) => d.ws === ws && d.repoId === repoId).length;
  }
  async insert(i: { workspaceId: string; repoId: string; path: string; content: string; copiedFrom: string | null }) {
    if (this.docs.some((d) => d.repoId === i.repoId && d.path === i.path)) return undefined;
    const d = {
      ws: i.workspaceId,
      id: `dd-${++this.seq}`,
      repoId: i.repoId,
      path: i.path,
      content: i.content,
      copiedFrom: i.copiedFrom,
      updatedAt: new Date(),
    };
    this.docs.push(d);
    return this.strip(d);
  }
  async updateContent(ws: string, id: string, content: string) {
    const d = this.docs.find((x) => x.ws === ws && x.id === id);
    if (!d) return undefined;
    d.content = content;
    d.updatedAt = new Date();
    return this.strip(d);
  }
  async deleteAndDetach(ws: string, id: string) {
    const d = this.docs.find((x) => x.ws === ws && x.id === id);
    if (!d) return undefined;
    this.docs = this.docs.filter((x) => x !== d);
    let detached = 0;
    for (const a of this.agents.values()) if (a.attached.delete(`${d.repoId}/${d.path}`)) detached++;
    return { repoId: d.repoId, path: d.path, detached };
  }
  async attachedAgents(ws: string, repoId: string, path: string) {
    if (ws !== WS) return [];
    return [...this.agents.entries()]
      .filter(([, a]) => a.attached.has(`${repoId}/${path}`))
      .map(([id, a]) => ({ id, name: a.name }));
  }
}

let ddRepo: FakeDevdigestDocsRepo;
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
  ddRepo = new FakeDevdigestDocsRepo();
  getIndexState = vi.fn(async () => ({ status: 'full', updatedAt: new Date('2026-01-02T00:00:00Z') }));
  readFile = vi.fn(async (_repo: unknown, path: string) => {
    if (!(path in files)) throw new Error('ENOENT');
    return files[path]!;
  });
  const container = {
    contextRepo,
    devdigestDocsRepo: ddRepo,
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

const B64 = (t: string | Buffer) => Buffer.from(t).toString('base64');
const DD = (p: string) => `.devdigest/specs/${p}`;
const NOT_CLONED = () => contextRepo.repos.set(REPO.id, { ...REPO, clonePath: null });

async function caught(p: Promise<unknown>): Promise<Error & { details?: unknown }> {
  try {
    await p;
  } catch (e) {
    return e as Error & { details?: unknown };
  }
  throw new Error('expected rejection');
}

describe('.devdigest listing (SPEC-03 AC-4)', () => {
  it('ignores the repo .devdigest namespace, merges DB docs and counts ignored paths', async () => {
    walked.push('.devdigest/specs/x.md', '.devdigest/notes.md');
    files['.devdigest/specs/x.md'] = 'repo copy';
    await ddRepo.insert({ workspaceId: WS, repoId: REPO.id, path: DD('mine.md'), content: 'mine', copiedFrom: null });

    const list = await service.listDocs(WS, REPO.id);
    const paths = list.docs.map((d) => d.path);
    expect(paths).toContain('docs/a.md');
    expect(paths).toContain(DD('mine.md'));
    expect(paths).not.toContain(DD('x.md'));
    expect(paths).not.toContain('.devdigest/notes.md');
    expect(list.docs.find((d) => d.path === DD('mine.md'))!.source).toBe('devdigest');
    expect(paths).toEqual([...paths].sort());

    const dd = await service.listDevdigestDocs(WS, REPO.id);
    expect(dd.ignored_repo_paths).toBe(2);
    expect(dd.synced_at).toBe('2026-01-02T00:00:00.000Z');
    expect(dd.limit).toBe(200);
  });

  it('not cloned: devdigest docs only, readable, writable; synced_at null when never indexed', async () => {
    NOT_CLONED();
    getIndexState.mockResolvedValue({ status: 'full', updatedAt: new Date(0) });
    const created = await service.createDevdigestDoc(WS, REPO.id, '', 'mine');
    const list = await service.listDocs(WS, REPO.id);
    expect(list.state).toEqual({ status: 'not_cloned' });
    expect(list.docs.map((d) => d.path)).toEqual([DD('mine.md')]);
    await service.saveDevdigestDoc(WS, created.id, 'hello');
    expect((await service.getDoc(WS, REPO.id, DD('mine.md'))).content).toBe('hello');
    expect((await service.listDevdigestDocs(WS, REPO.id)).synced_at).toBeNull();
    expect((await service.deleteDevdigestDoc(WS, created.id)).deleted).toBe(created.id);
  });
});

describe('createDevdigestDoc (AC-5)', () => {
  it('appends .md and starts empty; rejects bad names, duplicates and the limit', async () => {
    const doc = await service.createDevdigestDoc(WS, REPO.id, '', 'review-checklist');
    expect(doc).toMatchObject({ path: DD('review-checklist.md'), content: '', used_by: [] });

    const bad = await caught(service.createDevdigestDoc(WS, REPO.id, '', '../x'));
    expect(bad).toBeInstanceOf(ValidationError);
    expect(bad.details).toEqual({ reason: 'invalid_name', rule: 'dot_dot' });

    const dup = await caught(service.createDevdigestDoc(WS, REPO.id, '', 'review-checklist.md'));
    expect(dup.details).toEqual({ reason: 'exists', path: DD('review-checklist.md'), doc_id: doc.id });

    for (let i = 1; i < 200; i++) {
      await ddRepo.insert({ workspaceId: WS, repoId: REPO.id, path: DD(`n${i}.md`), content: '', copiedFrom: null });
    }
    const full = await caught(service.createDevdigestDoc(WS, REPO.id, '', 'one-more'));
    expect(full.details).toEqual({ reason: 'limit_reached', limit: 200 });
    expect(await ddRepo.countByRepo(WS, REPO.id)).toBe(200);
  });
});

describe('saveDevdigestDoc (AC-6) and forRun', () => {
  it('rejects > 1 MiB bytes unchanged; a valid save reaches the next forRun', async () => {
    const doc = await service.createDevdigestDoc(WS, REPO.id, '', 'a');
    const err = await caught(service.saveDevdigestDoc(WS, doc.id, 'x'.repeat(1_048_577)));
    expect(err.details).toEqual({ reason: 'too_large', limit: 1_048_576 });
    expect((await service.getDevdigestDoc(WS, doc.id)).content).toBe('');

    await service.saveDevdigestDoc(WS, doc.id, 'fresh text');
    await contextRepo.replaceAttachments(AGENT, REPO.id, [DD('a.md')]);
    const ctx = await service.forRun(WS, REPO, AGENT, []);
    expect(ctx!.specs).toEqual([`### ${DD('a.md')}\n\nfresh text`]);
  });

  it('not cloned: devdigest attached -> ok trace with repo_unavailable; repo-only -> unavailable', async () => {
    await ddRepo.insert({ workspaceId: WS, repoId: REPO.id, path: DD('x.md'), content: 'body', copiedFrom: null });
    await contextRepo.replaceAttachments(AGENT, REPO.id, [DD('x.md'), 'docs/a.md']);
    const ref = { ...REPO, clonePath: null };
    const ctx = await service.forRun(WS, ref, AGENT, []);
    expect(ctx!.specs).toEqual([`### ${DD('x.md')}\n\nbody`]);
    expect(ctx!.trace).toMatchObject({ status: 'ok', repo_unavailable: ['docs/a.md'] });
    expect(ctx!.logLine).toContain('1 repo doc(s) unavailable: repo not synced');

    await contextRepo.replaceAttachments(AGENT, REPO.id, ['docs/a.md']);
    expect((await service.forRun(WS, ref, AGENT, []))!.trace).toMatchObject({ status: 'unavailable' });
  });

  it('cloned: a devdigest attachment is never missing because of the walker list', async () => {
    await ddRepo.insert({ workspaceId: WS, repoId: REPO.id, path: DD('x.md'), content: 'body', copiedFrom: null });
    await contextRepo.replaceAttachments(AGENT, REPO.id, [DD('x.md')]);
    walked = [];
    const res = await service.getAgentDocs(WS, AGENT, REPO.id);
    expect(res.docs[0]).toMatchObject({ status: 'ok', source: 'devdigest' });
    expect(readFile).not.toHaveBeenCalledWith(expect.anything(), DD('x.md'));
  });
});

describe('uploadDevdigestDoc (AC-8)', () => {
  const up = (filename: string, body: string | Buffer, overwrite = false) =>
    service.uploadDevdigestDoc(WS, REPO.id, { folder: '', filename, content_base64: B64(body), overwrite });

  it('validates type, then text; handles exists / overwrite', async () => {
    expect((await caught(up('a.txt', 'x'))).details).toEqual({ reason: 'not_markdown' });
    expect((await caught(up('a.md', 'a\u0000b'))).details).toEqual({ reason: 'not_text' });

    const first = await up('a.md', 'one');
    expect(first.created).toBe(true);
    const conflict = await caught(up('a.md', 'two'));
    expect(conflict.details).toMatchObject({ reason: 'exists', doc_id: first.doc.id });
    const over = await up('a.md', 'two', true);
    expect(over).toMatchObject({ created: false, doc: { content: 'two' } });
  });
});

describe('copyRepoDoc (AC-9)', () => {
  it('mirrors a discovered doc, keeps the first copy on a 2nd call, never touches attachments', async () => {
    await contextRepo.replaceAttachments(AGENT, REPO.id, ['specs/b.md']);
    const first = await service.copyRepoDoc(WS, REPO.id, 'specs/b.md');
    expect(first.created).toBe(true);
    expect(first.doc).toMatchObject({ path: DD('specs/b.md'), copied_from: 'specs/b.md', content: text(20) });

    await service.saveDevdigestDoc(WS, first.doc.id, 'edited');
    const second = await service.copyRepoDoc(WS, REPO.id, 'specs/b.md');
    expect(second).toMatchObject({ created: false, doc: { content: 'edited' } });
    expect(await contextRepo.listAttachments(AGENT, REPO.id)).toEqual(['specs/b.md']);
  });

  it('refuses undiscovered, devdigest and uncloned sources', async () => {
    files['docs/x.md'] = 'hidden';
    await expect(service.copyRepoDoc(WS, REPO.id, 'docs/x.md')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.copyRepoDoc(WS, REPO.id, DD('a.md'))).rejects.toBeInstanceOf(NotFoundError);
    NOT_CLONED();
    await expect(service.copyRepoDoc(WS, REPO.id, 'specs/b.md')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('deleteDevdigestDoc / used_by (AC-10)', () => {
  it('reports both agents before delete and detaches them', async () => {
    const doc = await service.createDevdigestDoc(WS, REPO.id, '', 'a');
    const key = `${REPO.id}/${doc.path}`;
    ddRepo.agents.set('ag-1', { name: 'One', attached: new Set([key]) });
    ddRepo.agents.set('ag-2', { name: 'Two', attached: new Set([key]) });
    expect((await service.getDevdigestDoc(WS, doc.id)).used_by.map((a) => a.name)).toEqual(['One', 'Two']);
    expect(await service.deleteDevdigestDoc(WS, doc.id)).toEqual({ deleted: doc.id, detached_agents: 2 });
  });
});

describe('workspace scoping (AC-12)', () => {
  it('another workspace gets NotFoundError from every new method', async () => {
    const doc = await service.createDevdigestDoc(WS, REPO.id, '', 'a');
    const O = 'other-ws';
    const upload = { folder: '', filename: 'b.md', content_base64: B64('x'), overwrite: false };
    const calls: Promise<unknown>[] = [
      service.listDevdigestDocs(O, REPO.id),
      service.getDevdigestDoc(O, doc.id),
      service.createDevdigestDoc(O, REPO.id, '', 'b'),
      service.uploadDevdigestDoc(O, REPO.id, upload),
      service.copyRepoDoc(O, REPO.id, 'specs/b.md'),
      service.saveDevdigestDoc(O, doc.id, 'x'),
      service.deleteDevdigestDoc(O, doc.id),
    ];
    for (const c of calls) await expect(c).rejects.toBeInstanceOf(NotFoundError);
    expect(await ddRepo.countByRepo(WS, REPO.id)).toBe(1);
  });
});

describe('forBrief (SPEC-06 AC-4)', () => {
  const rows = (...p: [string, string][]) => p.map(([agentId, path]) => ({ agentId, path }));

  it('unions agents in order, each path once (first position wins)', async () => {
    files['specs/b.md'] = text(5);
    files['docs/c.md'] = text(6);
    files['docs/a.md'] = text(7);
    walked.push('docs/c.md');
    contextRepo.enabledRows = rows(['alpha', 'specs/b.md'], ['alpha', 'docs/c.md'], ['beta', 'docs/a.md'], ['beta', 'specs/b.md']);
    const sel = await service.forBrief(WS, REPO.id);
    expect(sel.included.map((d) => d.path)).toEqual(['specs/b.md', 'docs/c.md', 'docs/a.md']);
    expect(sel.left_out).toEqual([]);
  });

  it('too_large, over_cap and missing', async () => {
    files['docs/a.md'] = text(5000);
    files['specs/b.md'] = text(3000);
    files['docs/c.md'] = text(2000);
    walked.push('docs/c.md', 'docs/gone.md');
    contextRepo.enabledRows = rows(['a', 'docs/a.md'], ['a', 'specs/b.md'], ['a', 'docs/c.md'], ['a', 'docs/gone.md']);
    const sel = await service.forBrief(WS, REPO.id);
    expect(sel.included.map((d) => d.path)).toEqual(['specs/b.md']);
    expect(sel.left_out).toEqual([
      { path: 'docs/a.md', tokens: 5000, reason: 'too_large' },
      { path: 'docs/c.md', tokens: 2000, reason: 'over_cap' },
      { path: 'docs/gone.md', tokens: null, reason: 'missing' },
    ]);
  });

  it('no attachments → empty selection', async () => {
    expect(await service.forBrief(WS, REPO.id)).toEqual({ included: [], left_out: [], total_tokens: 0 });
  });

  it('not cloned: repo docs missing, .devdigest docs still included', async () => {
    contextRepo.repos.set(REPO.id, { ...REPO, clonePath: null });
    await ddRepo.insert({ workspaceId: WS, repoId: REPO.id, path: '.devdigest/specs/x.md', content: 'hi', copiedFrom: null });
    contextRepo.enabledRows = rows(['a', 'docs/a.md'], ['a', '.devdigest/specs/x.md']);
    const sel = await service.forBrief(WS, REPO.id);
    expect(sel.included.map((d) => d.path)).toEqual(['.devdigest/specs/x.md']);
    expect(sel.left_out).toEqual([{ path: 'docs/a.md', tokens: null, reason: 'missing' }]);
  });

  it('a repo outside the workspace → NotFoundError', async () => {
    await expect(service.forBrief('other', REPO.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
