import type { Provider, ReviewStrategy, CiFailOn } from '@devdigest/shared';

/**
 * specs/14-export-to-ci.md — narrow local ports, `modules/eval/ports.ts`'s
 * style. This module's own DB reads/writes go through `repository.ts`
 * directly (`db-only-in-repositories` permits it); ports exist only for the
 * OTHER modules' data this feature needs — agent config, skill bodies,
 * memory rows, an imported repo's id — so `service.ts`/`routes.ts` never
 * import another module's class (`no-cross-module`).
 */

/** The subset of an agent's stored config this module needs to generate a
 *  bundle. `container.agentsRepo.getById`'s real `AgentRow` satisfies this
 *  structurally (it carries every field here, plus more). */
export interface AgentRecord {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
}

export interface AgentLookup {
  getById(workspaceId: string, id: string): Promise<AgentRecord | undefined>;
  /** AC-41…AC-44 — the Agent Performance page needs every agent's name/
   *  provider/model to label aggregated rows, not just single lookups.
   *  Named `list` (not `listAll`) so `container.agentsRepo.list`'s real
   *  `AgentRow[]` satisfies this structurally with zero adapter. Optional so
   *  a caller that only needs `getById` can wire a minimal mock. */
  list?(workspaceId: string): Promise<AgentRecord[]>;
}

export interface SkillLookupRow {
  slug: string;
  body: string;
}

/** `container.agentsRepo.enabledSkills` returns `{id,name,type,body}[]` — a
 *  skill's `name` column IS its slug (`server/src/db/schema/skills.ts`), so
 *  `routes.ts` adapts it to `{slug, body}` at the composition point rather
 *  than this port matching the row shape field-for-field. */
export interface SkillLookup {
  enabledSkills(agentId: string): Promise<SkillLookupRow[]>;
}

export interface RepoScopedMemoryRow {
  kind: string;
  content: string;
}

/** `container.memoryRepo` (`modules/memory/repository.ts`, D-P4) satisfies
 *  this structurally. */
export interface MemoryReader {
  listRepoScoped(workspaceId: string, repoId: string): Promise<RepoScopedMemoryRow[]>;
}

/** `container.repoRepo.findByFullName`'s real `RepoRow` satisfies this
 *  structurally — resolves a target `owner/name` to an imported repo's id,
 *  or `undefined` when the repository is not imported (D7's edge case). */
export interface RepoLookup {
  findByFullName(workspaceId: string, fullName: string): Promise<{ id: string } | undefined>;
}
