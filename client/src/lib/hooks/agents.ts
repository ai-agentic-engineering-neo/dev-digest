/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { queryKeys } from "./query-keys";
import type { Agent, AgentSkillLink, ModelInfo, Provider, ReviewStrategy } from "@devdigest/shared";

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

/** An agent's skill links, in prompt order. */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.agentSkills(agentId),
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

export interface SetAgentSkillsVars {
  agentId: string;
  /** The full ordered list; the array index is the prompt order. */
  skills: { skill_id: string; enabled: boolean }[];
  /** The rows to show until the server answers (optimistic update). */
  optimistic: AgentSkillLink[];
}

/** Replace an agent's whole link set. Optimistic; rolls back on error (global toast). */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skills }: SetAgentSkillsVars) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skills }),
    onMutate: async ({ agentId, optimistic }) => {
      const key = queryKeys.agentSkills(agentId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AgentSkillLink[]>(key);
      qc.setQueryData(key, optimistic);
      return { previous };
    },
    onError: (_e, { agentId }, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKeys.agentSkills(agentId), ctx.previous);
    },
    onSettled: (_d, _e, { agentId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.agentSkills(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.agents() });
      qc.invalidateQueries({ queryKey: queryKeys.agent(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
    },
  });
}
