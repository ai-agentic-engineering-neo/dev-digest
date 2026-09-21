import { readFile, stat } from 'node:fs/promises';
import type { AttachedDocument, DocumentContent, DocumentList, ProjectDocument } from '@devdigest/shared';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { DEFAULT_DOC_ROOTS, MAX_DOC_BYTES, PROJECT_CONTEXT_TOKEN_BUDGET } from './constants.js';
import { discoverDocuments, labelFor } from './discovery.js';
import {
  ContainmentError,
  MissingPathError,
  isRelativeSafePath,
  resolveContainedPath,
} from '../_shared/checkout-paths.js';
import { ProjectContextRepository, type ContextDocRow } from './repository.js';

/**
 * specs/09-project-context-folder.md — application service.
 *
 * Owns discovery + browsing (view-only, D2/D7), attachment CRUD for agents
 * and skills (AC-8 through AC-13, AC-26), and the run-time resolution
 * algorithm (`resolveForRun`/`resolveForAdhoc`) that merges agent-direct and
 * skill-inherited attachments, applies the token budget, and reads content.
 *
 * Ports declared locally (server/LEARNINGS.md's `no-cross-module` pattern):
 * `AgentLookup`/`SkillLookup` verify ownership before any write reaches this
 * module's own repository; `AgentSkillLookup` reuses `AgentsRepository.
 * enabledSkills` so skill gating (AC-12: workspace-enabled AND agent-enabled)
 * is never re-implemented here. No `Container` import
 * (`no-container-in-services`).
 */

// ---- Ports (declared by this consumer; other modules' repositories satisfy
// these structurally — never imported directly, per no-cross-module) --------

export interface AgentLookup {
  getById(workspaceId: string, id: string): Promise<{ id: string } | null | undefined>;
}

export interface SkillLookup {
  getById(workspaceId: string, id: string): Promise<{ id: string } | null | undefined>;
}

/** Enabled skills in link order — `AgentsRepository.enabledSkills` already
 *  ANDs `skills.enabled` and `agent_skills.enabled` (AC-12 for free). */
export interface AgentSkillLookup {
  enabledSkills(agentId: string): Promise<{ id: string; name: string }[]>;
}

// ---- Run-time resolution shapes --------------------------------------------

export type SkipReason =
  | 'missing'
  | 'unreadable'
  | 'not_a_file'
  | 'too_large'
  | 'no_checkout'
  | 'refused_containment'
  | 'budget_drop'
  | 'repo_mismatch';

export interface ResolvedDocEntry {
  repoId: string;
  path: string;
  origin: 'agent' | 'skill';
  skill: string | null;
  status: 'included' | 'omitted' | 'refused' | 'dropped';
  reason: SkipReason | null;
  tokens: number;
  content: string | null;
}

export interface ResolveForRunResult {
  /** Only the successfully-read, budget-surviving documents — handed
   *  straight to reviewer-core's `PromptParts.specs`. */
  documents: { path: string; content: string }[];
  /** Every document considered, in resolved order, with its outcome —
   *  AC-18/AC-19/AC-32/AC-33/AC-36's full transparency record. */
  entries: ResolvedDocEntry[];
}

export interface ResolveForAdhocDoc {
  repo: { id: string; full_name: string };
  path: string;
  tokens: number;
  origin: 'agent' | 'skill';
  skill: string | null;
  status: ResolvedDocEntry['status'];
  reason: SkipReason | null;
}

export interface ResolveForAdhocResult {
  documents: { path: string; content: string }[];
  injected: ResolveForAdhocDoc[];
  skipped: ResolveForAdhocDoc[];
}

interface RepoRecord {
  id: string;
  fullName: string;
  clonePath: string | null;
}

export class ProjectContextService {
  constructor(
    private repo: ProjectContextRepository,
    private agents: AgentLookup,
    private skills: SkillLookup,
    private agentSkills: AgentSkillLookup,
    private tokenizer: Tokenizer,
  ) {}

  // ---- Discovery & browsing (view-only) ----------------------------------

  async listDocuments(workspaceId: string, repoId: string): Promise<DocumentList | undefined> {
    const repoRow = await this.repo.getRepoForContext(workspaceId, repoId);
    if (!repoRow) return undefined;

    const roots = repoRow.docRoots ?? [...DEFAULT_DOC_ROOTS];
    if (!repoRow.clonePath) {
      // AC-20 — no checkout yet: an explanatory empty state, not an error.
      return { roots, documents: [], summary: { count: 0, tokens: 0, bounded: 0 } };
    }

    const { documents: discovered, stats } = await discoverDocuments(repoRow.clonePath, roots);
    const clonePath = repoRow.clonePath;

    const withTokens: (ProjectDocument & { _path: string })[] = [];
    for (const doc of discovered) {
      let tokens = 0;
      try {
        const resolved = await resolveContainedPath(clonePath, doc.path);
        const content = await readFile(resolved, 'utf8');
        tokens = this.tokenizer.count(content);
      } catch {
        // A document that vanished/escaped between the walk and the read is
        // simply left out of the listing on this scan — no error surfaced
        // (AC-3's refresh will reflect it either way).
        continue;
      }
      withTokens.push({
        _path: doc.path,
        path: doc.path,
        doc_type: labelFor(doc),
        tokens,
        used_by: 0,
      });
    }

    const usedBy = await this.repo.usedByCounts(
      workspaceId,
      repoId,
      withTokens.map((d) => d._path),
    );
    const documents: ProjectDocument[] = withTokens.map((d) => ({
      path: d.path,
      doc_type: d.doc_type,
      tokens: d.tokens,
      used_by: usedBy.get(d._path) ?? 0,
    }));

    return {
      roots,
      documents,
      summary: {
        count: documents.length,
        tokens: documents.reduce((sum, d) => sum + d.tokens, 0),
        bounded: stats.bounded,
      },
    };
  }

  async getDocument(
    workspaceId: string,
    repoId: string,
    path: string,
  ): Promise<DocumentContent | undefined> {
    const repoRow = await this.repo.getRepoForContext(workspaceId, repoId);
    if (!repoRow) return undefined;
    if (!repoRow.clonePath) throw new NotFoundError('Repo has no synced checkout yet');

    const content = await this.readOne(repoRow.clonePath, path);
    if (content === null) throw new NotFoundError('Document not found');
    return { path, content };
  }

  async setDocRoots(workspaceId: string, repoId: string, roots: string[]): Promise<string[] | undefined> {
    for (const root of roots) {
      if (!isRelativeSafePath(root)) {
        throw new ValidationError(`Search root must be a relative, "."/".."-free path: "${root}"`, {
          field: 'doc_roots',
          root,
        });
      }
    }
    const ok = await this.repo.setDocRoots(workspaceId, repoId, roots);
    return ok ? roots : undefined;
  }

  // ---- Agent attachments --------------------------------------------------

  async listAgentDocuments(workspaceId: string, agentId: string): Promise<AttachedDocument[] | undefined> {
    const agent = await this.agents.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const rows = await this.repo.listForAgent(agentId);
    return this.toAttachedDocuments(rows);
  }

  async setAgentDocuments(
    workspaceId: string,
    agentId: string,
    docs: { repoId: string; path: string }[],
  ): Promise<AttachedDocument[] | undefined> {
    const agent = await this.agents.getById(workspaceId, agentId);
    if (!agent) return undefined;
    await this.assertOwnedRepos(workspaceId, docs);
    const rows = await this.repo.setAgentDocuments(agentId, docs);
    return this.toAttachedDocuments(rows);
  }

  async setAgentDocumentAttached(
    workspaceId: string,
    agentId: string,
    repoId: string,
    path: string,
    attached: boolean,
  ): Promise<AttachedDocument[] | undefined> {
    const agent = await this.agents.getById(workspaceId, agentId);
    if (!agent) return undefined;
    await this.assertOwnedRepos(workspaceId, [{ repoId, path }]);
    const rows = await this.repo.setAgentDocumentAttached(agentId, repoId, path, { attached });
    return this.toAttachedDocuments(rows);
  }

  // ---- Skill attachments (mirrors the agent methods above) --------------

  async listSkillDocuments(workspaceId: string, skillId: string): Promise<AttachedDocument[] | undefined> {
    const skill = await this.skills.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listForSkill(skillId);
    return this.toAttachedDocuments(rows);
  }

  async setSkillDocuments(
    workspaceId: string,
    skillId: string,
    docs: { repoId: string; path: string }[],
  ): Promise<AttachedDocument[] | undefined> {
    const skill = await this.skills.getById(workspaceId, skillId);
    if (!skill) return undefined;
    await this.assertOwnedRepos(workspaceId, docs);
    const rows = await this.repo.setSkillDocuments(skillId, docs);
    return this.toAttachedDocuments(rows);
  }

  async setSkillDocumentAttached(
    workspaceId: string,
    skillId: string,
    repoId: string,
    path: string,
    attached: boolean,
  ): Promise<AttachedDocument[] | undefined> {
    const skill = await this.skills.getById(workspaceId, skillId);
    if (!skill) return undefined;
    await this.assertOwnedRepos(workspaceId, [{ repoId, path }]);
    const rows = await this.repo.setSkillDocumentAttached(skillId, repoId, path, { attached });
    return this.toAttachedDocuments(rows);
  }

  /**
   * AC-13/D1 — a skill's own project-context block, rendered by the SAME
   * renderer a run uses (`_shared/project-context-render.ts`), plus its real
   * token cost. Called from `SkillsService.preview`, never re-implemented
   * there.
   */
  async resolveSkillDocuments(
    skillId: string,
  ): Promise<{ documents: { path: string; content: string }[] }> {
    const rows = await this.repo.listAttachedForSkill(skillId);
    const documents: { path: string; content: string }[] = [];
    for (const row of rows) {
      const content = await this.readAttachedRow(row);
      if (content !== null) documents.push({ path: row.path, content });
    }
    return { documents };
  }

  // ---- Run-time resolution -------------------------------------------------

  /**
   * PR-triggered run: `repoId` is always known, so a document pinned to a
   * different repo is dropped with `repo_mismatch` (AC-33).
   */
  async resolveForRun(
    workspaceId: string,
    agentId: string,
    repoId: string,
  ): Promise<ResolveForRunResult> {
    const entries = await this.resolveCandidates(workspaceId, agentId, repoId);
    const documents = entries
      .filter((e): e is ResolvedDocEntry & { content: string } => e.status === 'included')
      .map((e) => ({ path: e.path, content: e.content }));
    return { documents, entries };
  }

  /**
   * CLI / pre-push (adhoc) run: no PR, no single bound repo — planner
   * decision (finding 5): resolve from ALL pinned repos with no repo filter,
   * since the CLI path has no repo binding at all
   * (`POST /reviews/adhoc` takes `{agent_id, diff}` only). Under D3's
   * single-repo-per-workspace model this is byte-identical to the PR path.
   */
  async resolveForAdhoc(workspaceId: string, agentId: string): Promise<ResolveForAdhocResult> {
    const entries = await this.resolveCandidates(workspaceId, agentId, undefined);
    const documents = entries
      .filter((e): e is ResolvedDocEntry & { content: string } => e.status === 'included')
      .map((e) => ({ path: e.path, content: e.content }));

    const repoCache = new Map<string, RepoRecord | undefined>();
    const toDoc = async (e: ResolvedDocEntry): Promise<ResolveForAdhocDoc> => {
      const repoRecord = await this.repoRecord(e.repoId, repoCache);
      return {
        repo: { id: e.repoId, full_name: repoRecord?.fullName ?? e.repoId },
        path: e.path,
        tokens: e.tokens,
        origin: e.origin,
        skill: e.skill,
        status: e.status,
        reason: e.reason,
      };
    };

    const injected: ResolveForAdhocDoc[] = [];
    const skipped: ResolveForAdhocDoc[] = [];
    for (const e of entries) {
      const doc = await toDoc(e);
      (e.status === 'included' ? injected : skipped).push(doc);
    }
    return { documents, injected, skipped };
  }

  // ---- internals -----------------------------------------------------------

  /** Merge agent-direct + enabled-skill documents (AC-11), dedupe keeping the
   *  earliest position, read each (containment → stat → read), and apply the
   *  token budget (D6/AC-21) — the one algorithm both `resolveForRun` and
   *  `resolveForAdhoc` share. */
  private async resolveCandidates(
    workspaceId: string,
    agentId: string,
    filterRepoId: string | undefined,
  ): Promise<ResolvedDocEntry[]> {
    const agentDocs = await this.repo.listAttachedForAgent(agentId);
    const enabledSkills = await this.agentSkills.enabledSkills(agentId);

    type Candidate = { repoId: string; path: string; origin: 'agent' | 'skill'; skill: string | null };
    const candidates: Candidate[] = agentDocs.map((d) => ({
      repoId: d.repoId,
      path: d.path,
      origin: 'agent' as const,
      skill: null,
    }));
    for (const skill of enabledSkills) {
      const skillDocs = await this.repo.listAttachedForSkill(skill.id);
      for (const d of skillDocs) {
        candidates.push({ repoId: d.repoId, path: d.path, origin: 'skill', skill: skill.name });
      }
    }

    // Dedupe by (repoId, path), keeping the earliest position (AC-11).
    const seen = new Set<string>();
    const deduped: Candidate[] = [];
    for (const c of candidates) {
      const key = `${c.repoId} ${c.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(c);
    }

    const repoCache = new Map<string, RepoRecord | undefined>();
    const resolved: ResolvedDocEntry[] = [];
    for (const c of deduped) {
      if (filterRepoId !== undefined && c.repoId !== filterRepoId) {
        resolved.push(entry(c, 'omitted', 'repo_mismatch'));
        continue;
      }
      const repoRecord = await this.repoRecord(c.repoId, repoCache);
      if (!repoRecord || !repoRecord.clonePath) {
        resolved.push(entry(c, 'omitted', 'no_checkout'));
        continue;
      }

      let resolvedPath: string;
      try {
        resolvedPath = await resolveContainedPath(repoRecord.clonePath, c.path);
      } catch (err) {
        if (err instanceof ContainmentError) {
          resolved.push(entry(c, 'refused', 'refused_containment'));
        } else if (err instanceof MissingPathError) {
          resolved.push(entry(c, 'omitted', 'missing'));
        } else {
          resolved.push(entry(c, 'omitted', 'unreadable'));
        }
        continue;
      }

      let st;
      try {
        st = await stat(resolvedPath);
      } catch {
        resolved.push(entry(c, 'omitted', 'missing'));
        continue;
      }
      if (!st.isFile()) {
        resolved.push(entry(c, 'omitted', 'not_a_file'));
        continue;
      }
      if (st.size > MAX_DOC_BYTES) {
        resolved.push(entry(c, 'omitted', 'too_large'));
        continue;
      }

      let content: string;
      try {
        content = await readFile(resolvedPath, 'utf8');
      } catch {
        resolved.push(entry(c, 'omitted', 'unreadable'));
        continue;
      }

      const tokens = this.tokenizer.count(content);
      resolved.push({
        repoId: c.repoId,
        path: c.path,
        origin: c.origin,
        skill: c.skill,
        status: 'included',
        reason: null,
        tokens,
        content,
      });
    }

    return this.applyBudget(resolved);
  }

  /** D6/AC-21 — longest prefix of the resolved order (counting only
   *  successfully-read entries) whose summed tokens fit the budget; the rest
   *  become `dropped`/`budget_drop`. Never touches entries that already
   *  failed to read for another reason. */
  private applyBudget(entries: ResolvedDocEntry[]): ResolvedDocEntry[] {
    let sum = 0;
    let overBudget = false;
    return entries.map((e) => {
      if (e.status !== 'included') return e;
      if (!overBudget && sum + e.tokens <= PROJECT_CONTEXT_TOKEN_BUDGET) {
        sum += e.tokens;
        return e;
      }
      overBudget = true;
      return { ...e, status: 'dropped' as const, reason: 'budget_drop' as const, content: null };
    });
  }

  private async repoRecord(
    repoId: string,
    cache: Map<string, RepoRecord | undefined>,
  ): Promise<RepoRecord | undefined> {
    if (cache.has(repoId)) return cache.get(repoId);
    const row = await this.repo.getRepoById(repoId);
    const record: RepoRecord | undefined = row
      ? { id: row.id, fullName: row.fullName, clonePath: row.clonePath }
      : undefined;
    cache.set(repoId, record);
    return record;
  }

  /** Verify every distinct repo referenced by an incoming write belongs to
   *  the caller's workspace (so an attachment can never point at another
   *  workspace's repo), and that every path is a syntactically safe
   *  repository-relative path (defense at write time, not just read time). */
  private async assertOwnedRepos(
    workspaceId: string,
    docs: { repoId: string; path: string }[],
  ): Promise<void> {
    const repoIds = new Set(docs.map((d) => d.repoId));
    for (const repoId of repoIds) {
      const repoRow = await this.repo.getRepoForContext(workspaceId, repoId);
      if (!repoRow) {
        throw new ValidationError(`Repo not found in this workspace: ${repoId}`, {
          field: 'repo_id',
          repoId,
        });
      }
    }
    for (const doc of docs) {
      if (!isRelativeSafePath(doc.path)) {
        throw new ValidationError(`Document path is not a valid repository-relative path: "${doc.path}"`, {
          field: 'path',
          path: doc.path,
        });
      }
    }
  }

  private async toAttachedDocuments(rows: ContextDocRow[]): Promise<AttachedDocument[]> {
    const out: AttachedDocument[] = [];
    for (const row of rows) {
      const repoRow = await this.repo.getRepoById(row.repoId);
      let tokens = 0;
      let status: AttachedDocument['status'] = 'missing';
      if (repoRow?.clonePath) {
        const content = await this.readOne(repoRow.clonePath, row.path);
        if (content !== null) {
          tokens = this.tokenizer.count(content);
          status = 'present';
        }
      }
      out.push({ repo_id: row.repoId, path: row.path, order: row.order, attached: row.attached, tokens, status });
    }
    return out;
  }

  private async readAttachedRow(row: ContextDocRow): Promise<string | null> {
    const repoRow = await this.repo.getRepoById(row.repoId);
    if (!repoRow?.clonePath) return null;
    return this.readOne(repoRow.clonePath, row.path);
  }

  /** Containment → stat → read, swallowing every failure as `null` (used by
   *  read-only, best-effort paths: the discovery listing and the editors'
   *  `present`/`missing` badge — never the run-time resolver, which records
   *  WHY per-failure via `resolveCandidates`). */
  private async readOne(clonePath: string, path: string): Promise<string | null> {
    try {
      const resolved = await resolveContainedPath(clonePath, path);
      const st = await stat(resolved);
      if (!st.isFile() || st.size > MAX_DOC_BYTES) return null;
      return await readFile(resolved, 'utf8');
    } catch {
      return null;
    }
  }
}

function entry(
  c: { repoId: string; path: string; origin: 'agent' | 'skill'; skill: string | null },
  status: ResolvedDocEntry['status'],
  reason: SkipReason,
): ResolvedDocEntry {
  return { ...c, status, reason, tokens: 0, content: null };
}
