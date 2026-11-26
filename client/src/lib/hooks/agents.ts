/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { api } from "../api";
import type {
  Agent,
  AgentSkillLink,
  ModelInfo,
  Provider,
  ReviewStrategy,
} from "@devdigest/shared";

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents(),
    queryFn: () => api.get<Agent[]>("/agents"),
  });
}

export function useAgent(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.agent(id),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents() }),
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
      qc.invalidateQueries({ queryKey: queryKeys.agents() });
      qc.setQueryData(queryKeys.agent(data.id), data);
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/agents/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.agents() });
      qc.removeQueries({ queryKey: queryKeys.agent(id) });
    },
  });
}

/** Dynamic model list for a provider (editor model picker). */
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: queryKeys.providerModels(provider),
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}

/** The agent's attached skills, ordered by `order` (Agent Editor → Skills tab). */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.agentSkills(agentId),
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${encodeURIComponent(agentId!)}/skills`),
    enabled: !!agentId,
  });
}

/**
 * Replace the agent's attached skills with `skill_ids` (array order = prompt
 * order). Optimistic: the cache shows the new order at once and rolls back on
 * error — the caller shows the toast. Each call bumps the agent version server-side.
 */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  const key = queryKeys.agentSkills(agentId);
  return useMutation({
    mutationFn: (skillIds: string[]) =>
      api.post<AgentSkillLink[]>(`/agents/${encodeURIComponent(agentId)}/skills`, {
        skill_ids: skillIds,
      }),
    onMutate: async (skillIds) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AgentSkillLink[]>(key);
      qc.setQueryData<AgentSkillLink[]>(
        key,
        skillIds.map((skill_id, order) => ({ agent_id: agentId, skill_id, order })),
      );
      return { previous };
    },
    onError: (_e, _ids, ctx) => {
      qc.setQueryData(key, ctx?.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      // skill_count on agent cards, agent version, agent_count on skill cards
      qc.invalidateQueries({ queryKey: queryKeys.agents() });
      qc.invalidateQueries({ queryKey: queryKeys.agent(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
    },
  });
}

export interface LinkAgentSkillVars {
  agentId: string;
  skillId: string;
}

/**
 * Attach ONE skill to an agent (appended after its current skills). Not
 * optimistic: the agent-suggestions dialog shows per-agent results itself.
 */
export function useLinkAgentSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillId }: LinkAgentSkillVars) =>
      api.post<AgentSkillLink[]>(`/agents/${encodeURIComponent(agentId)}/skills`, { skill_id: skillId }),
    onSuccess: (links, { agentId, skillId }) => {
      qc.setQueryData(queryKeys.agentSkills(agentId), links);
      // skill_count / version on the agent, agent_count + usage + stats on the skill
      qc.invalidateQueries({ queryKey: queryKeys.agents() });
      qc.invalidateQueries({ queryKey: queryKeys.agent(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
      qc.invalidateQueries({ queryKey: queryKeys.skill(skillId) });
      qc.invalidateQueries({ queryKey: queryKeys.skillUsage(skillId) });
      qc.invalidateQueries({ queryKey: queryKeys.skillStats(skillId) });
      // Stale, but NOT refetched while the dialog is open: the server drops linked
      // agents from the list, and the dialog must keep showing them as "Linked".
      qc.invalidateQueries({ queryKey: queryKeys.agentSuggestions(skillId), refetchType: "none" });
    },
  });
}
