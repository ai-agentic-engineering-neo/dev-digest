import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { CONTEXT_TOKEN_CAP, PROJECT_CONTEXT_UNAVAILABLE } from './constants.js';
import {
  classifyDocPath,
  estimateTokens,
  selectForRun,
  type AgentContextDoc,
  type AgentContextDocs,
  type ContextDoc,
  type ContextDocContent,
  type ContextDocList,
  type ContextRepoState,
  type RunProjectContext,
} from './domain.js';
import type { ContextRepoRef } from './ports.js';

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
    const paths = (await this.container.docWalker.listMarkdown(ref.clonePath)).filter(
      (p) => classifyDocPath(p) !== null,
    );
    return this.readAll(ref, paths);
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
    if (!clonePath) return { repo_id: ref.id, state: { status: 'not_cloned' }, docs: [] };

    const [contents, counts, state] = await Promise.all([
      this.discover({ ...ref, clonePath }),
      this.repo.attachedAgentCounts(workspaceId, ref.id),
      this.indexState(ref.id),
    ]);
    const docs: ContextDoc[] = [];
    for (const [path, content] of contents) {
      docs.push(toContextDoc(path, content, counts));
    }
    return { repo_id: ref.id, state, docs };
  }

  async getDoc(workspaceId: string, repoId: string, path: string): Promise<ContextDocContent> {
    const ref = await this.requireRepo(workspaceId, repoId);
    if (!ref.clonePath || classifyDocPath(path) === null) throw new NotFoundError('Document not found');
    const discovered = await this.container.docWalker.listMarkdown(ref.clonePath);
    if (!discovered.includes(path)) throw new NotFoundError('Document not found');
    const content = await this.readDoc(ref, path);
    if (content === null) throw new NotFoundError('Document not found');
    const counts = await this.repo.attachedAgentCounts(workspaceId, ref.id);
    return { ...toContextDoc(path, content, counts), content };
  }

  async getAgentDocs(workspaceId: string, agentId: string, repoId: string): Promise<AgentContextDocs> {
    const ref = await this.requireAgentAndRepo(workspaceId, agentId, repoId);
    return this.agentDocs(ref, agentId);
  }

  private async agentDocs(ref: ContextRepoRef, agentId: string): Promise<AgentContextDocs> {
    const attached = await this.repo.listAttachments(agentId, ref.id);
    let readable = new Map<string, string>();
    if (ref.clonePath && attached.length > 0) {
      const discovered = new Set(await this.container.docWalker.listMarkdown(ref.clonePath));
      readable = await this.readAll(ref, attached.filter((p) => discovered.has(p)));
    }
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
    return this.agentDocs(ref, agentId);
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
    void workspaceId; // repo and agent were resolved by the executor from the workspace-checked run
    const attached = await this.repo.listAttachments(agentId, repo.id);
    if (attached.length === 0) return null;

    if (!repo.clonePath) {
      return {
        specs: [],
        trace: { status: 'unavailable', reason: PROJECT_CONTEXT_UNAVAILABLE, attached },
        logLine: 'project context unavailable: repo not synced',
      };
    }

    // Same defence as getDoc / agentDocs: only docs the walker discovered are read (it skips
    // symlinks), so an attached in-clone link is reported `missing`, never followed into the prompt.
    const discovered = new Set(await this.container.docWalker.listMarkdown(repo.clonePath));
    const contents = await this.readAll(repo, attached.filter((p) => discovered.has(p)));
    const sel = selectForRun(
      attached.map((path) => ({ path, content: contents.get(path) ?? null })),
      CONTEXT_TOKEN_CAP,
    );
    const changed = new Set(changedPaths);
    const included = sel.included.length;
    let logLine = `Project context: ${included} of ${attached.length} doc(s) included (~${sel.total_tokens} tokens)`;
    if (sel.left_out.length > 0) logLine += `; ${sel.left_out.length} left out`;
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
      },
      logLine,
    };
  }
}

function toContextDoc(path: string, content: string, counts: Map<string, number>): ContextDoc {
  // `discover` / `getDoc` only pass classifying paths
  const source = classifyDocPath(path)!;
  return { path, source, tokens: estimateTokens(content), attached_agents: counts.get(path) ?? 0 };
}
