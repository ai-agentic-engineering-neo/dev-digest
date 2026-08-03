/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Agent,
  AgentSkillLink,
  ModelInfo,
  Provider,
  ReviewStrategy,
  SkillWithStats,
} from "@devdigest/shared";

/** Cache key for one agent's skill links — shared by the query and both mutations. */
const skillLinksKey = (agentId: string | null | undefined) => ["agent-skills", agentId] as const;

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get<Agent[]>("/agents"),
  });
}

export function useAgent(id: string | null | undefined) {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.get<Agent>(`/agents/${id}`),
    enabled: !!id,
  });
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  enabled?: boolean;
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => api.post<Agent>("/agents", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export interface UpdateAgentInput {
  id: string;
  patch: Partial<
    Pick<
      Agent,
      | "name"
      | "description"
      | "provider"
      | "model"
      | "system_prompt"
      | "output_schema"
      | "strategy"
      | "ci_fail_on"
      | "repo_intel"
      | "enabled"
    >
  >;
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateAgentInput) => api.put<Agent>(`/agents/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.setQueryData(["agent", data.id], data);
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/agents/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.removeQueries({ queryKey: ["agent", id] });
    },
  });
}

/**
 * The whole workspace skill catalogue. The agent editor's Skills tab lists
 * EVERY skill (checked = linked + enabled on this agent), so it needs the full
 * list, not just the links.
 *
 * Uses the plain `["skills"]` key so it shares one cache entry with the /skills
 * page's own hook (`lib/hooks/skills.ts`); fold the two together once that page
 * lands.
 */
export function useWorkspaceSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<SkillWithStats[]>("/skills"),
  });
}

/** One agent's skill links, ordered — `enabled` is the per-agent gate. */
export function useAgentSkillLinks(agentId: string | null | undefined) {
  return useQuery({
    queryKey: skillLinksKey(agentId),
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/**
 * Set/reorder an agent's whole ordered link set (drag-to-reorder).
 *
 * `skill_ids` REPLACES the set: every id omitted is unlinked, so only
 * already-linked ids belong in this payload. Toggling a single skill goes
 * through `useSetAgentSkillEnabled` instead, which never unlinks.
 */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillIds }: { agentId: string; skillIds: string[] }) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: (links, { agentId }) => {
      // The route returns the resulting ordered links — seed the cache with them
      // so the rows and the "N of M enabled" header settle in one step.
      qc.setQueryData(skillLinksKey(agentId), links);
      qc.invalidateQueries({ queryKey: ["skills"] }); // rail "used by" stats
    },
  });
}

/**
 * Flip (or reposition) ONE link without unlinking it — the Skills tab checkbox.
 * A skill that was never linked is inserted by the server on first check, so
 * the client does not branch on "linked yet?".
 */
export function useSetAgentSkillEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      skillId,
      patch,
    }: {
      agentId: string;
      skillId: string;
      patch: { enabled?: boolean; order?: number };
    }) => api.put<AgentSkillLink[]>(`/agents/${agentId}/skills/${skillId}`, patch),
    onSuccess: (links, { agentId }) => {
      qc.setQueryData(skillLinksKey(agentId), links);
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

/** Dynamic model list for a provider (editor model picker). */
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: ["provider-models", provider],
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}
