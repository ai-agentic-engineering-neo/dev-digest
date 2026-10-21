import type {
  ContextAttachment,
  ContextFileContent,
  SpecFile,
} from '@devdigest/shared';
import {
  ConflictError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../../platform/errors.js';
import {
  LIST_READ_CONCURRENCY,
  PROJECT_CONTEXT_DOC_MAX_TOKENS,
  PROJECT_CONTEXT_FILE_MAX_CHARS,
  PROJECT_CONTEXT_RUN_MAX_TOKENS,
} from './constants.js';
import {
  applyPromptBudget,
  attachedLine,
  globToPathspecs,
  isExcludedPath,
  isProbablyBinary,
  isSafePath,
  overrideTextIssue,
  safeTokenCount,
  resolveContextOrder,
  skippedLine,
  summaryLine,
  toSpecFile,
  truncateToTokens,
  validateAttachPaths,
  type ListedFile,
} from './helpers.js';
import type {
  OverrideDto,
  ProjectContextDeps,
  RepoLookupDto,
  ResolveForRunInput,
  ResolvedContext,
  ResolvedContextBlock,
} from './ports.js';

interface Listing {
  repo: RepoLookupDto;
  sha: string;
  files: Map<string, ListedFile>;
}

/**
 * Project context: discovers the Markdown documents of a repository from git,
 * stores which ones an agent or skill attaches (paths only) and resolves them
 * into prompt blocks at run time. Contents are read from the object database
 * only (`listFiles`/`showFile`), never from the working tree.
 */
export class ProjectContextService {
  /** Latest listing per repo, keyed `repoId:sha:glob` (token counts only, no text). */
  private cache = new Map<string, { key: string; files: Map<string, ListedFile> }>();
  /** Token count of each override, keyed `repoId:path`, valid for one `updatedAt` (outside the listing cache). */
  private overrideTokens = new Map<string, { updatedAt: string; tokens: number }>();

  constructor(private readonly deps: ProjectContextDeps) {}

  /** Every count of document text goes through the guard (long unspaced runs are approximated). */
  private count = (text: string): number => safeTokenCount((t) => this.deps.tokenizer.count(t), text);

  // ---- listing -------------------------------------------------------------

  /** Documents of the repo's default branch; `refresh` bypasses the per-sha cache. */
  async list(
    workspaceId: string,
    repoId: string,
    opts: { refresh?: boolean } = {},
  ): Promise<SpecFile[]> {
    const listing = await this.listing(workspaceId, repoId, !!opts.refresh);
    const usage = new Map(
      (await this.deps.repo.usageCounts(workspaceId, repoId)).map((u) => [u.path, u]),
    );
    // Merged on every call (never cached with the listing). Overrides of unlisted or
    // too-large paths are ignored and kept (AC-53).
    const overrides = new Map(
      (await this.deps.repo.overrides(workspaceId, repoId)).map((o) => [o.path, o]),
    );
    return [...listing.files.values()]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => {
        const o = f.tooLarge ? undefined : overrides.get(f.path);
        return toSpecFile(f, usage.get(f.path), o ? { tokens: this.overrideTokenCount(repoId, o) } : undefined);
      });
  }

  private overrideTokenCount(repoId: string, o: OverrideDto): number {
    const key = `${repoId}:${o.path}`;
    const memo = this.overrideTokens.get(key);
    if (memo && memo.updatedAt === o.updatedAt) return memo.tokens;
    const tokens = this.count(o.text);
    this.overrideTokens.set(key, { updatedAt: o.updatedAt, tokens });
    return tokens;
  }

  /** Text of one listed document at the default-branch head. */
  async readFile(workspaceId: string, repoId: string, path: string): Promise<ContextFileContent> {
    if (!isSafePath(path)) throw new ValidationError('Unsafe path', { issues: [{ path, reason: 'unsafe' }] });
    const listing = await this.listing(workspaceId, repoId, false);
    const file = listing.files.get(path);
    if (!file) throw new NotFoundError('Document not found');
    if (file.tooLarge) {
      throw new ValidationError('Document is too large to preview', {
        issues: [{ path, reason: 'too_large' }],
      });
    }
    return this.effective(workspaceId, repoId, listing, path);
  }

  /** Effective text of a listed, not too-large document: the override, else the repository text. */
  private async effective(
    workspaceId: string,
    repoId: string,
    listing: Listing,
    path: string,
  ): Promise<ContextFileContent> {
    let repoText: string;
    try {
      repoText = await this.deps.git.showFile(this.ref(listing.repo), listing.sha, path);
    } catch (err) {
      throw new ExternalServiceError('Could not read the document from git', {
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }
    const [override] = await this.deps.repo.overrides(workspaceId, repoId, [path]);
    if (!override) return { path, sha: listing.sha, text: repoText, modified: false };
    return {
      path,
      sha: listing.sha,
      text: override.text,
      modified: true,
      repo_text: repoText,
      updated_at: override.updatedAt,
    };
  }

  /**
   * Save (or clear) the local override of a listed document. Writes only to the DB:
   * the git dependency is read-only (`listFiles`/`showFile`).
   */
  async saveFile(
    workspaceId: string,
    repoId: string,
    path: string,
    text: string,
  ): Promise<ContextFileContent> {
    if (!isSafePath(path)) throw new ValidationError('Unsafe path', { issues: [{ path, reason: 'unsafe' }] });
    const listing = await this.listing(workspaceId, repoId, false);
    const file = listing.files.get(path);
    if (!file) throw new ValidationError('Document is not listed', { issues: [{ path, reason: 'unknown' }] });
    if (file.tooLarge) {
      throw new ValidationError('Document is too large to edit', { issues: [{ path, reason: 'too_large' }] });
    }
    const issue = overrideTextIssue(text);
    if (issue) {
      const message =
        issue === 'empty'
          ? 'Text cannot be empty; use "Reset to repository version" to go back to the repository text'
          : issue === 'too_long'
            ? `Text is longer than ${PROJECT_CONTEXT_FILE_MAX_CHARS} characters`
            : 'Text cannot contain NUL characters';
      throw new ValidationError(message, { issues: [{ path, reason: issue }] });
    }
    let repoText: string;
    try {
      repoText = await this.deps.git.showFile(this.ref(listing.repo), listing.sha, path);
    } catch (err) {
      throw new ExternalServiceError('Could not read the document from git', {
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }
    if (text === repoText) {
      await this.deps.repo.deleteOverride(workspaceId, repoId, path);
      return { path, sha: listing.sha, text: repoText, modified: false };
    }
    const saved = await this.deps.repo.upsertOverride(workspaceId, repoId, { path, text, sha: file.blob });
    return {
      path,
      sha: listing.sha,
      text: saved.text,
      modified: true,
      repo_text: repoText,
      updated_at: saved.updatedAt,
    };
  }

  /** Remove the override of a listed document and return its repository version. */
  async resetFile(workspaceId: string, repoId: string, path: string): Promise<ContextFileContent> {
    if (!isSafePath(path)) throw new ValidationError('Unsafe path', { issues: [{ path, reason: 'unsafe' }] });
    const listing = await this.listing(workspaceId, repoId, false);
    const file = listing.files.get(path);
    if (!file) throw new NotFoundError('Document not found'); // an orphan override is kept (AC-53)
    if (file.tooLarge) {
      throw new ValidationError('Document is too large to preview', { issues: [{ path, reason: 'too_large' }] });
    }
    await this.deps.repo.deleteOverride(workspaceId, repoId, path);
    return this.effective(workspaceId, repoId, listing, path);
  }

  private ref(repo: RepoLookupDto) {
    return { owner: repo.owner, name: repo.name };
  }

  private async listing(workspaceId: string, repoId: string, refresh: boolean): Promise<Listing> {
    const repo = await this.deps.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    if (!repo.clonePath) {
      throw new ConflictError('Repository is not cloned yet', { reason: 'repo_not_cloned' });
    }
    let listed: { sha: string; files: { path: string; size: number; blob: string }[] };
    try {
      listed = await this.deps.git.listFiles(
        this.ref(repo),
        repo.defaultBranch,
        globToPathspecs(this.deps.glob),
      );
    } catch (err) {
      throw new ExternalServiceError('Could not list repository documents', {
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }
    const key = `${repoId}:${listed.sha}:${this.deps.glob}`;
    const cached = this.cache.get(repoId);
    if (!refresh && cached && cached.key === key) {
      return { repo, sha: listed.sha, files: cached.files };
    }

    const files = new Map<string, ListedFile>();
    const toRead: ListedFile[] = [];
    for (const f of listed.files) {
      if (isExcludedPath(f.path)) continue;
      const entry: ListedFile = {
        path: f.path,
        size: f.size,
        tooLarge: f.size > PROJECT_CONTEXT_FILE_MAX_CHARS,
        tokens: null,
        blob: f.blob,
      };
      files.set(f.path, entry);
      if (!entry.tooLarge) toRead.push(entry);
    }
    await this.mapLimit(toRead, LIST_READ_CONCURRENCY, async (entry) => {
      try {
        const text = await this.deps.git.showFile(this.ref(repo), listed.sha, entry.path);
        entry.tokens = this.count(text);
      } catch {
        entry.tokens = null; // unreadable: listed without a count
      }
    });
    // keep only the latest sha per repo to bound memory
    this.cache.set(repoId, { key, files });
    return { repo, sha: listed.sha, files };
  }

  private async mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const item = items[next++]!;
        await fn(item);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  }

  // ---- attachments ---------------------------------------------------------

  async getAgentContext(workspaceId: string, agentId: string, repoId: string): Promise<ContextAttachment[]> {
    if (!(await this.deps.agents.getById(workspaceId, agentId))) throw new NotFoundError('Agent not found');
    const listing = await this.listing(workspaceId, repoId, false);
    return this.toAttachments(await this.deps.agents.contextPaths(workspaceId, agentId, repoId), listing);
  }

  async setAgentContext(
    workspaceId: string,
    agentId: string,
    repoId: string,
    paths: string[],
  ): Promise<ContextAttachment[]> {
    if (!(await this.deps.agents.getById(workspaceId, agentId))) throw new NotFoundError('Agent not found');
    const listing = await this.listing(workspaceId, repoId, false);
    this.assertAttachable(paths, listing);
    if (!(await this.deps.agents.setContext(workspaceId, agentId, repoId, paths))) {
      throw new NotFoundError('Agent not found');
    }
    return this.toAttachments(await this.deps.agents.contextPaths(workspaceId, agentId, repoId), listing);
  }

  async getSkillContext(workspaceId: string, skillId: string, repoId: string): Promise<ContextAttachment[]> {
    if (!(await this.deps.skills.getById(workspaceId, skillId))) throw new NotFoundError('Skill not found');
    const listing = await this.listing(workspaceId, repoId, false);
    return this.toAttachments(await this.deps.repo.skillPaths(workspaceId, skillId, repoId), listing);
  }

  async setSkillContext(
    workspaceId: string,
    skillId: string,
    repoId: string,
    paths: string[],
  ): Promise<ContextAttachment[]> {
    if (!(await this.deps.skills.getById(workspaceId, skillId))) throw new NotFoundError('Skill not found');
    const listing = await this.listing(workspaceId, repoId, false);
    this.assertAttachable(paths, listing);
    await this.deps.repo.setSkillPaths(workspaceId, skillId, repoId, paths);
    return this.toAttachments(await this.deps.repo.skillPaths(workspaceId, skillId, repoId), listing);
  }

  private assertAttachable(paths: string[], listing: Listing): void {
    const issues = validateAttachPaths(paths, listing.files);
    if (issues.length > 0) throw new ValidationError('Some paths cannot be attached', { issues });
  }

  private toAttachments(paths: string[], listing: Listing): ContextAttachment[] {
    return paths.map((path, order) => {
      const file = listing.files.get(path);
      return { path, order, missing: !file, too_large: !!file?.tooLarge };
    });
  }

  // ---- run -----------------------------------------------------------------

  /**
   * Resolve the documents of a run: agent paths, then each enabled skill's, first
   * occurrence wins; read at the PR's base branch; truncate and budget. Never
   * throws: every failure becomes a "Context skipped" log line.
   */
  async resolveForRun(workspaceId: string, input: ResolveForRunInput): Promise<ResolvedContext> {
    const empty: ResolvedContext = { blocks: [], totalTokens: 0 };
    const { log } = input;
    try {
      const agentPaths = await this.deps.agents.contextPaths(workspaceId, input.agentId, input.repoId);
      const byId = await this.deps.repo.skillPathsFor(
        workspaceId,
        input.repoId,
        input.skills.map((s) => s.id),
      );
      const ordered = resolveContextOrder(
        agentPaths,
        input.skills.map((s) => ({ name: s.name, paths: byId[s.id] ?? [] })),
      );
      if (ordered.length === 0) return empty;

      const skipAll = (reason: string): ResolvedContext => {
        for (const d of ordered) log(skippedLine(d.path, reason));
        return empty;
      };
      const repo = await this.deps.repos.getById(workspaceId, input.repoId);
      if (!repo) return skipAll('repository not found');
      if (!repo.clonePath) return skipAll('repository is not cloned');
      let listed: { sha: string; files: { path: string; size: number; blob: string }[] };
      try {
        listed = await this.deps.git.listFiles(
          this.ref(repo),
          input.baseBranch,
          globToPathspecs(this.deps.glob),
        );
      } catch {
        return skipAll(`base branch "${input.baseBranch}" is not available in the clone`);
      }
      const sizes = new Map(listed.files.map((f) => [f.path, f.size]));
      // One read of the overrides at run start (a save during the run applies to the next run).
      const overrides = new Map(
        (
          await this.deps.repo.overrides(
            workspaceId,
            input.repoId,
            ordered.map((d) => d.path),
          )
        ).map((o) => [o.path, o]),
      );

      const read: ResolvedContextBlock[] = [];
      for (const doc of ordered) {
        const size = sizes.get(doc.path);
        if (size === undefined || isExcludedPath(doc.path)) {
          log(skippedLine(doc.path, 'not found at the base branch'));
          continue;
        }
        if (size > PROJECT_CONTEXT_FILE_MAX_CHARS) {
          log(skippedLine(doc.path, 'over the file size cap'));
          continue;
        }
        const override = overrides.get(doc.path);
        let text: string;
        if (override) {
          text = override.text; // edited text is DB text, not a git blob: no binary check
        } else {
          try {
            text = await this.deps.git.showFile(this.ref(repo), listed.sha, doc.path);
          } catch {
            log(skippedLine(doc.path, 'read error'));
            continue;
          }
          if (isProbablyBinary(text)) {
            log(skippedLine(doc.path, 'not UTF-8 text'));
            continue;
          }
        }
        const cut = truncateToTokens(text, PROJECT_CONTEXT_DOC_MAX_TOKENS, this.count);
        if (cut.truncated) {
          log(`Context truncated: ${doc.path} to ${PROJECT_CONTEXT_DOC_MAX_TOKENS} tokens`);
        }
        read.push({
          path: doc.path,
          text: cut.text,
          tokens: this.count(cut.text),
          truncated: cut.truncated,
          source: doc.source,
          modified: !!override,
        });
      }

      const { kept, skipped } = applyPromptBudget(read, PROJECT_CONTEXT_RUN_MAX_TOKENS);
      for (const s of skipped) {
        log(skippedLine(s.path, `would exceed the ${PROJECT_CONTEXT_RUN_MAX_TOKENS}-token context budget`));
      }
      if (kept.length === 0) return empty;
      for (const b of kept) log(attachedLine(b.path, b.tokens, b.source, b.modified));
      const totalTokens = kept.reduce((n, b) => n + b.tokens, 0);
      log(summaryLine(kept.length, totalTokens));
      return { blocks: kept, totalTokens };
    } catch (err) {
      log(`Context skipped: ${err instanceof Error ? err.message : 'unexpected error'}`);
      return empty;
    }
  }
}
