import { ProjectContextService } from '../../src/modules/project-context/service.js';
import type {
  OverrideDto,
  ProjectContextDeps,
  ProjectContextRepositoryPort,
  RepoLookupDto,
} from '../../src/modules/project-context/ports.js';
import { MockGitClient } from '../../src/adapters/mocks.js';

export const WS = 'w1';
export const REPO_ID = '33333333-3333-4333-8333-333333333333';
export const AGENT_ID = '44444444-4444-4444-8444-444444444444';
export const SKILL_ID = '55555555-5555-4555-8555-555555555555';

/** In-memory fakes of every port the service needs; no DB, no git, no tokenizer. */
export function makeFakes(
  opts: {
    files?: Record<string, string>;
    repo?: Partial<RepoLookupDto> | null;
    head?: string;
  } = {},
) {
  const agentPaths = new Map<string, string[]>();
  const skillPaths = new Map<string, string[]>();
  const git = new MockGitClient({ files: opts.files ?? {}, head: opts.head ?? 'a1b2c3d4' });
  const counts = { tokens: 0 };
  /** `workspace:repo:path` → override row. */
  const overrides = new Map<string, OverrideDto>();
  const writes = { upsert: 0, delete: 0 };
  let clock = 0;
  const repoPort: ProjectContextRepositoryPort = {
    overrides: async (w, repoId, paths) =>
      [...overrides.entries()]
        .filter(([k, o]) => k.startsWith(`${w}:${repoId}:`) && (!paths || paths.includes(o.path)))
        .map(([, o]) => o),
    upsertOverride: async (w, repoId, input) => {
      writes.upsert++;
      const row: OverrideDto = { ...input, updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, ++clock)).toISOString() };
      overrides.set(`${w}:${repoId}:${input.path}`, row);
      return row;
    },
    deleteOverride: async (w, repoId, path) => {
      writes.delete++;
      return overrides.delete(`${w}:${repoId}:${path}`);
    },
    skillPaths: async (_w, skillId, repoId) => skillPaths.get(`${skillId}:${repoId}`) ?? [],
    setSkillPaths: async (_w, skillId, repoId, paths) => {
      skillPaths.set(`${skillId}:${repoId}`, paths);
    },
    usageCounts: async (_w, repoId) => {
      // the fake has no agent↔skill links, so agents using a path = agents attaching it directly
      const m = new Map<string, { path: string; agents: number; skills: number; agentsUsing: number }>();
      for (const [k, paths] of agentPaths) {
        if (!k.endsWith(`:${repoId}`)) continue;
        for (const p of paths) {
          const c = m.get(p) ?? { path: p, agents: 0, skills: 0, agentsUsing: 0 };
          c.agents++;
          c.agentsUsing++;
          m.set(p, c);
        }
      }
      for (const [k, paths] of skillPaths) {
        if (!k.endsWith(`:${repoId}`)) continue;
        for (const p of paths) {
          const c = m.get(p) ?? { path: p, agents: 0, skills: 0, agentsUsing: 0 };
          c.skills++;
          m.set(p, c);
        }
      }
      return [...m.values()];
    },
    skillPathsFor: async (_w, repoId, ids) =>
      Object.fromEntries(ids.map((id) => [id, skillPaths.get(`${id}:${repoId}`) ?? []])),
  };
  const repoRow: RepoLookupDto | undefined =
    opts.repo === null
      ? undefined
      : { id: REPO_ID, owner: 'o', name: 'r', defaultBranch: 'main', clonePath: '/x', ...opts.repo };
  const deps: ProjectContextDeps = {
    repo: repoPort,
    agents: {
      getById: async (_w, id) => (id === AGENT_ID ? { id } : undefined),
      contextPaths: async (_w, agentId, repoId) => agentPaths.get(`${agentId}:${repoId}`) ?? [],
      setContext: async (_w, agentId, repoId, paths) => {
        if (agentId !== AGENT_ID) return false;
        agentPaths.set(`${agentId}:${repoId}`, paths);
        return true;
      },
    },
    skills: { getById: async (_w, id) => (id === SKILL_ID ? { id } : undefined) },
    repos: { getById: async (_w, id) => (id === REPO_ID ? repoRow : undefined) },
    git,
    tokenizer: {
      count: (t: string) => {
        counts.tokens++;
        return Math.ceil(t.length / 4);
      },
    },
    glob: '**/{specs,docs,insights}/**/*.md',
  };
  return { deps, git, service: new ProjectContextService(deps), agentPaths, skillPaths, counts, overrides, writes };
}
