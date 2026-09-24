/* hooks/skills.ts — React Query hooks for the Skills screen, the skill editor
   and the Agent Editor's Skills tab (server/specs/03-skills.md API table).
   Mutations own invalidation (see client/specs/03-skills.md "Hooks"). */
"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  AgentSkillLink,
  CommunitySkill,
  CreateSkillInput,
  Skill,
  SkillAgentRef,
  SkillImportPreview,
  SkillImportRequest,
  SkillStats,
  SkillStatsSummary,
  SkillVersion,
  UpdateSkillInput,
} from "@devdigest/shared";
import { api, ApiError } from "../api";
import { agentKeys, skillKeys, type CommunitySkillFilters } from "./keys";

/** ApiError code of a PUT whose base_version is behind the server. */
export const STALE_VERSION_CODE = "stale_version";

export function isStaleVersionError(err: unknown): boolean {
  return err instanceof ApiError && err.code === STALE_VERSION_CODE;
}

// ---- Skills ----

export function useSkills() {
  return useQuery({ queryKey: skillKeys.list(), queryFn: () => api.get<Skill[]>("/skills") });
}

/** Pull % · accept % · findings of every skill (the list cards). */
export function useSkillStatsSummary() {
  return useQuery({
    queryKey: skillKeys.stats(),
    queryFn: () => api.get<SkillStatsSummary[]>("/skills/stats"),
    staleTime: 60_000,
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.detail(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: (skill) => {
      qc.setQueryData(skillKeys.detail(skill.id), skill);
      qc.invalidateQueries({ queryKey: skillKeys.list() });
    },
  });
}

/** Cache writes after the server returned a new state of a skill. */
function storeSkill(qc: QueryClient, skill: Skill) {
  qc.setQueryData(skillKeys.detail(skill.id), skill);
  qc.invalidateQueries({ queryKey: skillKeys.list() });
  qc.invalidateQueries({ queryKey: skillKeys.versions(skill.id) });
}

export interface UpdateSkillVars {
  id: string;
  patch: UpdateSkillInput;
}

/** PUT /skills/:id (partial). A 409 stale_version is left to the caller's
 *  toast; the live skill is refetched so the next save uses its version. */
export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillVars) => api.put<Skill>(`/skills/${id}`, patch),
    meta: { quietErrorCodes: [STALE_VERSION_CODE] },
    onSuccess: (skill) => storeSkill(qc, skill),
    onError: (err, { id }) => {
      if (!isStaleVersionError(err)) return;
      qc.invalidateQueries({ queryKey: skillKeys.detail(id) });
    },
  });
}

/** Patch `enabled` on a skill in the list + detail caches. */
function patchEnabled(qc: QueryClient, id: string, enabled: boolean) {
  qc.setQueryData<Skill[]>(skillKeys.list(), (list) => list?.map((s) => (s.id === id ? { ...s, enabled } : s)));
  qc.setQueryData<Skill>(skillKeys.detail(id), (s) => (s ? { ...s, enabled } : s));
}

/** The card's enabled switch — optimistic on list + detail, rolled back on error. */
export function useToggleSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.put<Skill>(`/skills/${id}`, { enabled } satisfies UpdateSkillInput),
    onMutate: async ({ id, enabled }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: skillKeys.list() }),
        qc.cancelQueries({ queryKey: skillKeys.detail(id), exact: true }),
      ]);
      const previous = qc.getQueryData<Skill[]>(skillKeys.list())?.find((s) => s.id === id)?.enabled
        ?? qc.getQueryData<Skill>(skillKeys.detail(id))?.enabled;
      patchEnabled(qc, id, enabled);
      return { previous };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.previous !== undefined) patchEnabled(qc, id, ctx.previous);
    },
    onSuccess: (skill) => {
      qc.setQueryData(skillKeys.detail(skill.id), skill);
      patchEnabled(qc, skill.id, skill.enabled);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: skillKeys.detail(id) });
      qc.removeQueries({ queryKey: skillKeys.agents(id) });
      qc.invalidateQueries({ queryKey: skillKeys.list() });
      qc.invalidateQueries({ queryKey: skillKeys.stats() });
      qc.invalidateQueries({ queryKey: agentKeys.skillsAll() });
    },
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.versions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** POST /skills/:id/versions/:v/restore → a NEW version with vK's texts. */
export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (skill) => storeSkill(qc, skill),
  });
}

/** Agents that link a skill ("Used by", delete confirm). */
export function useSkillAgents(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.agents(id),
    queryFn: () => api.get<SkillAgentRef[]>(`/skills/${id}/agents`),
    enabled: !!id,
  });
}

export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.statsFor(id),
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

/** Query string of the community search ('' when no filter is set). */
export function communityQuery(f: CommunitySkillFilters): string {
  const params = new URLSearchParams();
  for (const key of ["q", "tag", "lang"] as const) {
    const value = f[key]?.trim();
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useCommunitySkills(filters: CommunitySkillFilters) {
  return useQuery({
    queryKey: skillKeys.community(filters),
    queryFn: () => api.get<CommunitySkill[]>(`/skills/community${communityQuery(filters)}`),
    staleTime: 5 * 60_000,
  });
}

/** POST /skills/import/preview — persists nothing; errors are shown in the modal. */
export function useImportPreview() {
  return useMutation({
    mutationFn: (req: SkillImportRequest) => api.post<SkillImportPreview>("/skills/import/preview", req),
    meta: { quietErrorCodes: ["*"] },
  });
}

// ---- Agent ↔ skill links ----

/** The agent's linked skills, ordered as they appear in the prompt. */
export function useAgentSkillLinks(agentId: string | null | undefined) {
  return useQuery({
    queryKey: agentKeys.skills(agentId),
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
    select: sortLinks,
  });
}

/** Links in prompt order (by `order`). */
export function sortLinks(links: AgentSkillLink[]): AgentSkillLink[] {
  return [...links].sort((a, b) => a.order - b.order);
}

/** The ordered id list as link rows (the optimistic cache value). */
export function toLinks(agentId: string, skillIds: readonly string[]): AgentSkillLink[] {
  return skillIds.map((skill_id, order) => ({ agent_id: agentId, skill_id, order }));
}

/** POST /agents/:id/skills { skill_ids } — replaces the ordered set. Optimistic
 *  on the agent's links, rolled back on error. */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  const key = agentKeys.skills(agentId);
  return useMutation({
    mutationFn: (skillIds: string[]) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onMutate: async (skillIds) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AgentSkillLink[]>(key);
      qc.setQueryData(key, toLinks(agentId, skillIds));
      return { previous };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (links) => {
      qc.setQueryData(key, links);
      qc.invalidateQueries({ queryKey: agentKeys.detail(agentId), exact: true });
      qc.invalidateQueries({ queryKey: agentKeys.versions(agentId) });
      qc.invalidateQueries({ queryKey: skillKeys.list() });
      qc.invalidateQueries({ queryKey: skillKeys.agentsAll() });
    },
  });
}
