import type { Container } from '../../platform/container.js';
import { ConflictError, NotFoundError, ValidationError } from '../../platform/errors.js';
import {
  CONTEXT_TOKEN_CAP,
  MAX_DEVDIGEST_DOCS,
  MAX_DEVDIGEST_DOC_BYTES,
  MAX_DOC_PATH_CHARS,
  PROJECT_CONTEXT_UNAVAILABLE,
} from './constants.js';
import {
  buildDevdigestPath,
  classifyDocPath,
  decodeUploadText,
  estimateTokens,
  isDevdigestNamespace,
  mirrorToDevdigest,
  selectForRun,
  unionAttachedPaths,
  utf8Bytes,
  type AgentContextDoc,
  type AgentContextDocs,
  type ContextDoc,
  type ContextDocContent,
  type ContextDocList,
  type ContextSelection,
  type ContextRepoState,
  type DevdigestCopyResult,
  type DevdigestDeleteResult,
  type DevdigestDoc,
  type DevdigestDocErrorDetails,
  type DevdigestDocList,
  type RunProjectContext,
} from './domain.js';
import type { ContextRepoRef, DevdigestDocRecord } from './ports.js';

/** Parallel file reads per batch (a repo can have hundreds of docs). */
const READ_BATCH = 32;

/**
 * Project Context Folder (SPEC-01): lists a repo's markdown docs from its local clone, stores which
 * docs an agent reads per repo, and resolves those docs for a review run.
 *
 * Security: doc content is read ONLY through `container.git.readFile` (clone boundary + `.git`
 * refusal), and only for paths that classify as docs (`getDoc` also requires the walker to have
 * discovered the path), so `?path=` can't read source files or secrets.
 */
export class ProjectContextService {
  constructor(private readonly container: Container) {}

  private get repo() {
    return this.container.contextRepo;
  }

  /** Every discoverable doc of a cloned repo with its content (unreadable docs dropped). */
  private async discover(ref: ContextRepoRef & { clonePath: string }): Promise<Map<string, string>> {
    // `.devdigest/**` in the repo is never a repo doc (DevDigest-owned namespace).
    const paths = (await this.container.docWalker.listMarkdown(ref.clonePath)).filter(
      (p) => !isDevdigestNamespace(p) && classifyDocPath(p) !== null,
    );
    return this.readAll(ref, paths);
  }

  /** Walker .md paths under the repo's own `.devdigest/` (ignored, reported to the user). */
  private async ignoredRepoPaths(clonePath: string): Promise<number> {
    return (await this.container.docWalker.listMarkdown(clonePath)).filter(isDevdigestNamespace).length;
  }

  private get ddRepo() {
    return this.container.devdigestDocsRepo;
  }

  /** path → content for each readable path (order kept); a read error drops the path. */
  private async readAll(ref: ContextRepoRef, paths: readonly string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (let i = 0; i < paths.length; i += READ_BATCH) {
      const batch = paths.slice(i, i + READ_BATCH);
      const reads = await Promise.all(batch.map((p) => this.readDoc(ref, p)));
      batch.forEach((p, j) => {
        const content = reads[j];
        if (content != null) out.set(p, content);
      });
    }
    return out;
  }

  private async readDoc(ref: ContextRepoRef, path: string): Promise<string | null> {
    if (classifyDocPath(path) === null) return null;
    try {
      return await this.container.git.readFile({ owner: ref.owner, name: ref.name }, path);
    } catch {
      return null;
    }
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<ContextRepoRef> {
    const ref = await this.repo.repoInWorkspace(workspaceId, repoId);
    if (!ref) throw new NotFoundError('Repository not found');
    return ref;
  }

  private async requireAgentAndRepo(workspaceId: string, agentId: string, repoId: string): Promise<ContextRepoRef> {
    const [agentOk, ref] = await Promise.all([
      this.repo.agentInWorkspace(workspaceId, agentId),
      this.repo.repoInWorkspace(workspaceId, repoId),
    ]);
    if (!agentOk) throw new NotFoundError('Agent not found');
    if (!ref) throw new NotFoundError('Repository not found');
    return ref;
  }

  /** Index health only labels the list; it never hides docs (AC-5). Best-effort. */
  private async indexState(repoId: string): Promise<ContextRepoState> {
    try {
      const st = await this.container.repoIntel.getIndexState(repoId);
      const reason = st.degradedReason ?? st.reason ?? null;
      if (st.status === 'failed') return { status: 'index_failed', reason };
      if (st.status === 'degraded' || st.degraded) return { status: 'index_degraded', reason };
      return { status: 'ready' };
    } catch {
      return { status: 'ready' };
    }
  }

  async listDocs(workspaceId: string, repoId: string): Promise<ContextDocList> {
    const ref = await this.requireRepo(workspaceId, repoId);
    const clonePath = ref.clonePath;
    const [ddDocs, counts] = await Promise.all([
      this.ddRepo.listByRepo(workspaceId, ref.id),
      this.repo.attachedAgentCounts(workspaceId, ref.id),
    ]);
    const docs: ContextDoc[] = ddDocs.map((d) => toContextDoc(d.path, d.content, counts));
    if (!clonePath) return { repo_id: ref.id, state: { status: 'not_cloned' }, docs: docs.sort(byPath) };

    const [contents, state] = await Promise.all([this.discover({ ...ref, clonePath }), this.indexState(ref.id)]);
    for (const [path, content] of contents) {
      docs.push(toContextDoc(path, content, counts));
    }
    return { repo_id: ref.id, state, docs: docs.sort(byPath) };
  }

  async getDoc(workspaceId: string, repoId: string, path: string): Promise<ContextDocContent> {
    const ref = await this.requireRepo(workspaceId, repoId);
    const source = classifyDocPath(path);
    if (source === 'devdigest') {
      const [rec] = await this.ddRepo.getByPaths(workspaceId, ref.id, [path]);
      if (!rec) throw new NotFoundError('Document not found');
      const counts = await this.repo.attachedAgentCounts(workspaceId, ref.id);
      return { ...toContextDoc(path, rec.content, counts), content: rec.content };
    }
    if (!ref.clonePath || source === null) throw new NotFoundError('Document not found');
    const discovered = await this.container.docWalker.listMarkdown(ref.clonePath);
    if (!discovered.includes(path)) throw new NotFoundError('Document not found');
    const content = await this.readDoc(ref, path);
    if (content === null) throw new NotFoundError('Document not found');
    const counts = await this.repo.attachedAgentCounts(workspaceId, ref.id);
    return { ...toContextDoc(path, content, counts), content };
  }

  /**
   * path -> content of each readable attached doc. `.devdigest` docs come from the DB (also when the
   * repo is not cloned); repo docs only when cloned AND walker-discovered.
   */
  private async readAttached(
    workspaceId: string,
    ref: ContextRepoRef,
    attached: readonly string[],
  ): Promise<Map<string, string>> {
    const ddPaths = attached.filter((p) => classifyDocPath(p) === 'devdigest');
    const repoPaths = attached.filter((p) => classifyDocPath(p) !== 'devdigest');
    const out = new Map<string, string>();
    if (ddPaths.length > 0) {
      for (const d of await this.ddRepo.getByPaths(workspaceId, ref.id, ddPaths)) out.set(d.path, d.content);
    }
    if (ref.clonePath && repoPaths.length > 0) {
      const discovered = new Set(await this.container.docWalker.listMarkdown(ref.clonePath));
      const read = await this.readAll(ref, repoPaths.filter((p) => discovered.has(p)));
      for (const [p, c] of read) out.set(p, c);
    }
    return out;
  }

  async getAgentDocs(workspaceId: string, agentId: string, repoId: string): Promise<AgentContextDocs> {
    const ref = await this.requireAgentAndRepo(workspaceId, agentId, repoId);
    return this.agentDocs(workspaceId, ref, agentId);
  }

  private async agentDocs(workspaceId: string, ref: ContextRepoRef, agentId: string): Promise<AgentContextDocs> {
    const attached = await this.repo.listAttachments(agentId, ref.id);
    const readable = await this.readAttached(workspaceId, ref, attached);
    const docs: AgentContextDoc[] = attached.map((path, position) => {
      const content = readable.get(path);
      const source = classifyDocPath(path);
      return content != null && source
        ? { path, position, status: 'ok', source, tokens: estimateTokens(content) }
        : { path, position, status: 'missing', source: null, tokens: null };
    });
    return { agent_id: agentId, repo_id: ref.id, docs };
  }

  async setAgentDocs(
    workspaceId: string,
    agentId: string,
    repoId: string,
    paths: string[],
  ): Promise<AgentContextDocs> {
    const ref = await this.requireAgentAndRepo(workspaceId, agentId, repoId);
    if (new Set(paths).size !== paths.length) throw new ValidationError('Duplicate document paths');
    const bad = paths.filter((p) => classifyDocPath(p) === null);
    if (bad.length > 0) throw new ValidationError('Not a project-context document', { paths: bad });
    // Existence is NOT required: a missing doc stays attached until the user detaches it.
    await this.repo.replaceAttachments(agentId, ref.id, paths);
    return this.agentDocs(workspaceId, ref, agentId);
  }

  /**
   * The project context of one agent run. `null` when the agent has no attachments for the repo
   * (AC-11). Missing docs never throw; an attachment-query error propagates (the executor catches it).
   * The index state is not consulted: docs come from the clone's working tree (last synced commit).
   * `specs` holds one `### <path>\n\n<content>` entry per included doc, in attach order; the cap
   * counts doc content only, never that fixed text.
   */
  async forRun(
    workspaceId: string,
    repo: ContextRepoRef,
    agentId: string,
    changedPaths: string[],
  ): Promise<RunProjectContext | null> {
    const attached = await this.repo.listAttachments(agentId, repo.id);
    if (attached.length === 0) return null;

    const isDd = (p: string) => classifyDocPath(p) === 'devdigest';
    let repoUnavailable: string[] = [];
    let readList = attached;
    if (!repo.clonePath) {
      if (!attached.some(isDd)) {
        return {
          specs: [],
          trace: { status: 'unavailable', reason: PROJECT_CONTEXT_UNAVAILABLE, attached },
          logLine: 'project context unavailable: repo not synced',
        };
      }
      readList = attached.filter(isDd);
      repoUnavailable = attached.filter((p) => !isDd(p));
    }

    // Repo docs: only walker-discovered paths are read (it skips symlinks), so an attached in-clone
    // link is reported `missing`, never followed into the prompt. `.devdigest` docs come from the DB.
    const contents = await this.readAttached(workspaceId, repo, readList);
    const sel = selectForRun(
      readList.map((path) => ({ path, content: contents.get(path) ?? null })),
      CONTEXT_TOKEN_CAP,
    );
    const changed = new Set(changedPaths);
    const included = sel.included.length;
    let logLine = `Project context: ${included} of ${readList.length} doc(s) included (~${sel.total_tokens} tokens)`;
    if (sel.left_out.length > 0) logLine += `; ${sel.left_out.length} left out`;
    if (repoUnavailable.length > 0) {
      logLine += `; ${repoUnavailable.length} repo doc(s) unavailable: repo not synced`;
    }
    return {
      // One resolved entry per doc, `### <path>` + content. The engine wraps each entry in
      // <untrusted source="spec-i"> and adds the `## Project context` heading + note (SPEC-04 AC-10).
      specs: sel.included.map((d) => `### ${d.path}\n\n${d.content}`),
      trace: {
        status: 'ok',
        cap_tokens: CONTEXT_TOKEN_CAP,
        total_tokens: sel.total_tokens,
        included: sel.included.map((d) => ({ path: d.path, tokens: d.tokens })),
        left_out: sel.left_out,
        changed_by_pr: attached.filter((p) => changed.has(p)),
        ...(repoUnavailable.length > 0 ? { repo_unavailable: repoUnavailable } : {}),
      },
      logLine,
    };
  }

  /**
   * Spec docs for the PR brief: union of the attachments of the workspace's enabled agents for the
   * repo (agent name order, then position; first occurrence wins), read like a run and capped.
   * Missing docs are reported as left out, never thrown.
   */
  async forBrief(workspaceId: string, repoId: string): Promise<ContextSelection> {
    const ref = await this.requireRepo(workspaceId, repoId);
    const rows = await this.repo.listEnabledAgentAttachments(workspaceId, ref.id);
    const paths = unionAttachedPaths(rows);
    if (paths.length === 0) return { included: [], left_out: [], total_tokens: 0 };
    const contents = await this.readAttached(workspaceId, ref, paths);
    return selectForRun(
      paths.map((path) => ({ path, content: contents.get(path) ?? null })),
      CONTEXT_TOKEN_CAP,
    );
  }

  // ---------- DevDigest-owned docs (SPEC-03) ----------

  async listDevdigestDocs(workspaceId: string, repoId: string): Promise<DevdigestDocList> {
    const ref = await this.requireRepo(workspaceId, repoId);
    const [records, syncedAt, ignored] = await Promise.all([
      this.ddRepo.listByRepo(workspaceId, ref.id),
      this.syncedAt(ref.id),
      ref.clonePath ? this.ignoredRepoPaths(ref.clonePath).catch(() => 0) : Promise.resolve(0),
    ]);
    return {
      repo_id: ref.id,
      docs: records.map(toDevdigestMeta),
      limit: MAX_DEVDIGEST_DOCS,
      synced_at: syncedAt,
      ignored_repo_paths: ignored,
    };
  }

  private async syncedAt(repoId: string): Promise<string | null> {
    try {
      const { updatedAt } = await this.container.repoIntel.getIndexState(repoId);
      return updatedAt.getTime() === 0 ? null : updatedAt.toISOString();
    } catch {
      return null;
    }
  }

  async getDevdigestDoc(workspaceId: string, id: string): Promise<DevdigestDoc> {
    const rec = await this.requireDoc(workspaceId, id);
    return this.toDevdigestDoc(workspaceId, rec);
  }

  async createDevdigestDoc(workspaceId: string, repoId: string, folder: string, name: string): Promise<DevdigestDoc> {
    const ref = await this.requireRepo(workspaceId, repoId);
    const built = buildDevdigestPath(folder, name, { appendMd: true });
    if (!built.ok) throw invalidName(built.rule);
    await this.assertUnderLimit(workspaceId, ref.id);
    const rec = await this.ddRepo.insert({
      workspaceId,
      repoId: ref.id,
      path: built.path,
      content: '',
      copiedFrom: null,
    });
    if (!rec) throw await this.existsError(workspaceId, ref.id, built.path);
    return this.toDevdigestDoc(workspaceId, rec);
  }

  async uploadDevdigestDoc(
    workspaceId: string,
    repoId: string,
    input: { folder: string; filename: string; content_base64: string; overwrite: boolean },
  ): Promise<{ created: boolean; doc: DevdigestDoc }> {
    const ref = await this.requireRepo(workspaceId, repoId);
    if (!input.filename.toLowerCase().endsWith('.md')) throw unprocessable({ reason: 'not_markdown' });
    const built = buildDevdigestPath(input.folder, input.filename, { appendMd: false });
    if (!built.ok) throw invalidName(built.rule);
    const decoded = decodeUploadText(input.content_base64);
    if (!decoded.ok) {
      throw unprocessable(
        decoded.reason === 'too_large'
          ? { reason: 'too_large', limit: MAX_DEVDIGEST_DOC_BYTES }
          : { reason: 'not_text' },
      );
    }
    const [existing] = await this.ddRepo.getByPaths(workspaceId, ref.id, [built.path]);
    if (existing) {
      if (!input.overwrite) throw await this.existsError(workspaceId, ref.id, built.path);
      const updated = await this.ddRepo.updateContent(workspaceId, existing.id, decoded.text);
      if (!updated) throw new NotFoundError('Document not found');
      return { created: false, doc: await this.toDevdigestDoc(workspaceId, updated) };
    }
    await this.assertUnderLimit(workspaceId, ref.id);
    const rec = await this.ddRepo.insert({
      workspaceId,
      repoId: ref.id,
      path: built.path,
      content: decoded.text,
      copiedFrom: null,
    });
    if (!rec) throw await this.existsError(workspaceId, ref.id, built.path);
    return { created: true, doc: await this.toDevdigestDoc(workspaceId, rec) };
  }

  async copyRepoDoc(workspaceId: string, repoId: string, sourcePath: string): Promise<DevdigestCopyResult> {
    const ref = await this.requireRepo(workspaceId, repoId);
    const source = classifyDocPath(sourcePath);
    if (!ref.clonePath || source === null || source === 'devdigest') throw new NotFoundError('Document not found');
    const discovered = await this.container.docWalker.listMarkdown(ref.clonePath);
    if (!discovered.includes(sourcePath)) throw new NotFoundError('Document not found');
    const target = mirrorToDevdigest(sourcePath);
    if (target.length > MAX_DOC_PATH_CHARS) throw invalidName('too_long');
    const [existing] = await this.ddRepo.getByPaths(workspaceId, ref.id, [target]);
    if (existing) return { created: false, doc: await this.toDevdigestDoc(workspaceId, existing) };
    const content = await this.readDoc(ref, sourcePath);
    if (content === null) throw new NotFoundError('Document not found');
    await this.assertUnderLimit(workspaceId, ref.id);
    const rec = await this.ddRepo.insert({
      workspaceId,
      repoId: ref.id,
      path: target,
      content,
      copiedFrom: sourcePath,
    });
    if (!rec) {
      // lost a race with another copy: return the winner unchanged
      const [winner] = await this.ddRepo.getByPaths(workspaceId, ref.id, [target]);
      if (!winner) throw new NotFoundError('Document not found');
      return { created: false, doc: await this.toDevdigestDoc(workspaceId, winner) };
    }
    return { created: true, doc: await this.toDevdigestDoc(workspaceId, rec) };
  }

  async saveDevdigestDoc(workspaceId: string, id: string, content: string): Promise<DevdigestDoc> {
    await this.requireDoc(workspaceId, id);
    if (utf8Bytes(content) > MAX_DEVDIGEST_DOC_BYTES) {
      throw unprocessable({ reason: 'too_large', limit: MAX_DEVDIGEST_DOC_BYTES });
    }
    const rec = await this.ddRepo.updateContent(workspaceId, id, content);
    if (!rec) throw new NotFoundError('Document not found');
    return this.toDevdigestDoc(workspaceId, rec);
  }

  async deleteDevdigestDoc(workspaceId: string, id: string): Promise<DevdigestDeleteResult> {
    const res = await this.ddRepo.deleteAndDetach(workspaceId, id);
    if (!res) throw new NotFoundError('Document not found');
    return { deleted: id, detached_agents: res.detached };
  }

  private async requireDoc(workspaceId: string, id: string): Promise<DevdigestDocRecord> {
    const rec = await this.ddRepo.getById(workspaceId, id);
    if (!rec) throw new NotFoundError('Document not found');
    return rec;
  }

  private async assertUnderLimit(workspaceId: string, repoId: string): Promise<void> {
    if ((await this.ddRepo.countByRepo(workspaceId, repoId)) >= MAX_DEVDIGEST_DOCS) {
      throw unprocessable({ reason: 'limit_reached', limit: MAX_DEVDIGEST_DOCS });
    }
  }

  private async existsError(workspaceId: string, repoId: string, path: string): Promise<ConflictError> {
    const [existing] = await this.ddRepo.getByPaths(workspaceId, repoId, [path]);
    return new ConflictError('Document already exists', {
      reason: 'exists',
      path,
      ...(existing ? { doc_id: existing.id } : {}),
    } satisfies DevdigestDocErrorDetails);
  }

  private async toDevdigestDoc(workspaceId: string, rec: DevdigestDocRecord): Promise<DevdigestDoc> {
    const used_by = await this.ddRepo.attachedAgents(workspaceId, rec.repoId, rec.path);
    return { ...toDevdigestMeta(rec), repo_id: rec.repoId, content: rec.content, used_by };
  }
}

function toContextDoc(path: string, content: string, counts: Map<string, number>): ContextDoc {
  // `discover` / `getDoc` only pass classifying paths
  const source = classifyDocPath(path)!;
  return { path, source, tokens: estimateTokens(content), attached_agents: counts.get(path) ?? 0 };
}

function byPath(a: { path: string }, b: { path: string }): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

function toDevdigestMeta(rec: DevdigestDocRecord) {
  return {
    id: rec.id,
    path: rec.path,
    tokens: estimateTokens(rec.content),
    copied_from: rec.copiedFrom,
    updated_at: rec.updatedAt.toISOString(),
  };
}

function unprocessable(details: DevdigestDocErrorDetails): ValidationError {
  return new ValidationError('Invalid document', details);
}

function invalidName(rule: NonNullable<DevdigestDocErrorDetails['rule']>): ValidationError {
  return unprocessable({ reason: 'invalid_name', rule });
}
