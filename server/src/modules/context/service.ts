import { access } from 'node:fs/promises';
import type {
  AgentContext,
  ContextDocument,
  ContextDocumentDetail,
  ContextList,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { NOT_CLONED_CODE } from './constants.js';
import { discoverMarkdown, readInsideClone, type DiscoveredFile } from './discovery.js';
import { dedupePaths, docTypeFor, invalidContextPathReason, splitPath } from '../../platform/project-context.js';

/** Token counts keyed by absolute file, invalidated by size + mtime. */
interface TokenCacheEntry {
  sizeBytes: number;
  mtimeMs: number;
  tokens: number;
}

/** Who uses which path: agents by effective set (own + inherited), skills directly. */
interface UsageIndex {
  agents: Map<string, { id: string; name: string }[]>;
  skills: Map<string, { id: string; name: string }[]>;
}

/**
 * Project Context service — discovers the active repo's markdown documents and
 * manages which paths agents and skills attach. Read-only over the clone;
 * attachment metadata stores paths only, never document text.
 */
export class ContextService {
  private static tokenCache = new Map<string, TokenCacheEntry>();

  constructor(private container: Container) {}

  /** The repo row + its clone directory, or a typed "not cloned" error. */
  private async resolveClone(workspaceId: string, repoId: string) {
    const repo = await this.container.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    const cloneDir =
      repo.clonePath ?? this.container.git.clonePathFor({ owner: repo.owner, name: repo.name });
    try {
      await access(cloneDir);
    } catch {
      throw new AppError(NOT_CLONED_CODE, `${repo.fullName} has no clone on disk yet`, 409, {
        repo: repo.fullName,
      });
    }
    return { repo, cloneDir };
  }

  private async tokensFor(cloneDir: string, file: DiscoveredFile): Promise<number> {
    const key = `${cloneDir}\0${file.path}`;
    const hit = ContextService.tokenCache.get(key);
    if (hit && hit.sizeBytes === file.sizeBytes && hit.mtimeMs === file.mtimeMs) return hit.tokens;
    let tokens = 0;
    try {
      tokens = this.container.tokenizer.count(await readInsideClone(cloneDir, file.path));
    } catch {
      tokens = 0;
    }
    ContextService.tokenCache.set(key, { sizeBytes: file.sizeBytes, mtimeMs: file.mtimeMs, tokens });
    return tokens;
  }

  private async usageIndex(workspaceId: string): Promise<UsageIndex> {
    const [agents, skills, links] = await Promise.all([
      this.container.agentsRepo.list(workspaceId),
      this.container.skillsRepo.list(workspaceId),
      this.container.agentsRepo.enabledSkillContextLinksForWorkspace(workspaceId),
    ]);
    const add = (m: Map<string, { id: string; name: string }[]>, path: string, v: { id: string; name: string }) => {
      const list = m.get(path) ?? [];
      if (!list.some((x) => x.id === v.id)) list.push(v);
      m.set(path, list);
    };
    const idx: UsageIndex = { agents: new Map(), skills: new Map() };
    const agentName = new Map(agents.map((a) => [a.id, a.name]));
    for (const a of agents) for (const p of a.contextPaths ?? []) add(idx.agents, p, { id: a.id, name: a.name });
    for (const l of links) {
      const name = agentName.get(l.agentId);
      if (!name) continue;
      for (const p of l.contextPaths) add(idx.agents, p, { id: l.agentId, name });
    }
    for (const s of skills) for (const p of s.contextPaths ?? []) add(idx.skills, p, { id: s.id, name: s.name });
    return idx;
  }

  private async toDocument(cloneDir: string, file: DiscoveredFile, usage: UsageIndex): Promise<ContextDocument> {
    const { dir, name } = splitPath(file.path);
    return {
      path: file.path,
      dir,
      name,
      type: docTypeFor(file.path),
      size_bytes: file.sizeBytes,
      tokens: await this.tokensFor(cloneDir, file),
      used_by: {
        agents: usage.agents.get(file.path)?.length ?? 0,
        skills: usage.skills.get(file.path)?.length ?? 0,
      },
      updated_at: new Date(file.mtimeMs).toISOString(),
    };
  }

  /** Every discovered document for a repo (GET /repos/:id/context). */
  async list(workspaceId: string, repoId: string): Promise<ContextList> {
    const { cloneDir } = await this.resolveClone(workspaceId, repoId);
    const { roots, glob, budgetTokens } = this.container.config.context;
    const [{ files, truncated }, usage] = await Promise.all([
      discoverMarkdown(cloneDir, roots, glob),
      this.usageIndex(workspaceId),
    ]);
    const documents: ContextDocument[] = [];
    for (const f of files) documents.push(await this.toDocument(cloneDir, f, usage));
    return {
      roots,
      glob,
      documents,
      scanned_at: new Date().toISOString(),
      truncated,
      budget_tokens: budgetTokens,
    };
  }

  /** One discovered document with its markdown (GET /repos/:id/context/file). */
  async get(workspaceId: string, repoId: string, path: string): Promise<ContextDocumentDetail> {
    if (invalidContextPathReason(path)) throw new NotFoundError('Document not found');
    const { cloneDir } = await this.resolveClone(workspaceId, repoId);
    const { roots, glob } = this.container.config.context;
    const [{ files }, usage] = await Promise.all([
      discoverMarkdown(cloneDir, roots, glob),
      this.usageIndex(workspaceId),
    ]);
    const file = files.find((f) => f.path === path);
    if (!file) throw new NotFoundError('Document not found');
    const content = await readInsideClone(cloneDir, path);
    return {
      ...(await this.toDocument(cloneDir, file, usage)),
      content,
      used_by_names: {
        agents: usage.agents.get(path) ?? [],
        skills: usage.skills.get(path) ?? [],
      },
    };
  }

  /** Validate + dedupe a submitted path list (400 on the first invalid path). */
  private cleanPaths(paths: readonly string[]): string[] {
    for (const p of paths) {
      const reason = invalidContextPathReason(p);
      if (reason) throw new AppError('validation_error', `Invalid context path "${p}": ${reason}`, 400, { path: p });
    }
    return dedupePaths(paths);
  }

  /** An agent's own (ordered) and skill-inherited paths. */
  async agentContext(workspaceId: string, agentId: string): Promise<AgentContext | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const links = await this.container.agentsRepo.enabledSkillsForPrompt(agentId);
    return {
      own: agent.contextPaths ?? [],
      inherited: links.flatMap((l) =>
        (l.skill.contextPaths ?? []).map((path) => ({
          path,
          skill_id: l.skill.id,
          skill_name: l.skill.name,
        })),
      ),
    };
  }

  async setAgentContext(
    workspaceId: string,
    agentId: string,
    paths: readonly string[],
  ): Promise<AgentContext | undefined> {
    const clean = this.cleanPaths(paths);
    const row = await this.container.agentsRepo.setContextPaths(workspaceId, agentId, clean);
    if (!row) return undefined;
    return this.agentContext(workspaceId, agentId);
  }

  async skillContext(workspaceId: string, skillId: string): Promise<{ paths: string[] } | undefined> {
    const skill = await this.container.skillsRepo.getById(workspaceId, skillId);
    return skill ? { paths: skill.contextPaths ?? [] } : undefined;
  }

  async setSkillContext(
    workspaceId: string,
    skillId: string,
    paths: readonly string[],
  ): Promise<{ paths: string[] } | undefined> {
    const clean = this.cleanPaths(paths);
    const row = await this.container.skillsRepo.setContextPaths(workspaceId, skillId, clean);
    return row ? { paths: row.contextPaths ?? [] } : undefined;
  }
}
