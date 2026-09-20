/* api/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { Agent, AgentAttachedSkill, CreateAgentInput, ModelInfo, UpdateAgentInput } from "@devdigest/shared";
import type { Provider } from "@devdigest/shared";

export const agentKeys = {
  all: ["agents"] as const,
  detail: (id: string | null | undefined) => ["agent", id] as const,
  skills: (id: string | null | undefined) => ["agent", id, "skills"] as const,
  providerModels: {
    all: ["provider-models"] as const,
    list: (provider: Provider | null | undefined) => ["provider-models", provider] as const,
  },
};

export function useAgents() {
  return useQuery({
    queryKey: agentKeys.all,
    queryFn: () => api.get("/agents", Agent.array()),
  });
}

export function useAgent(id: string | null | undefined) {
  return useQuery({
    queryKey: agentKeys.detail(id),
    queryFn: () => api.get(`/agents/${id}`, Agent),
    enabled: !!id,
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => api.post("/agents", input, Agent),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.all }),
  });
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateAgentInput }) =>
      api.put(`/agents/${id}`, patch, Agent),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: agentKeys.all });
      qc.setQueryData(agentKeys.detail(data.id), data);
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/agents/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: agentKeys.all });
      qc.removeQueries({ queryKey: agentKeys.detail(id) });
    },
  });
}

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: agentKeys.skills(agentId),
    queryFn: () => api.get(`/agents/${agentId}/skills`, AgentAttachedSkill.array()),
    enabled: !!agentId,
  });
}

/**
 * Replaces the agent's whole ordered skill set — array position becomes `order`.
 *
 * `links` is the caller's already-built next state, written into the cache
 * before the request goes out: the Skills tab renders straight from this query,
 * so an optimistic write is what makes a toggle feel instant WITHOUT a second
 * copy of the list in component state (a draft an effect has to keep in sync is
 * the bug this avoids). A failure rolls the snapshot back.
 */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, links }: { agentId: string; links: AgentAttachedSkill[] }) =>
      api.post(
        `/agents/${agentId}/skills`,
        { skill_ids: links.map((l) => ({ id: l.skill_id, enabled: l.enabled })) },
        AgentAttachedSkill.array(),
      ),
    onMutate: async ({ agentId, links }) => {
      await qc.cancelQueries({ queryKey: agentKeys.skills(agentId) });
      const previous = qc.getQueryData<AgentAttachedSkill[]>(agentKeys.skills(agentId));
      qc.setQueryData(agentKeys.skills(agentId), links);
      return { previous };
    },
    onError: (_err, { agentId }, ctx) => {
      if (ctx?.previous) qc.setQueryData(agentKeys.skills(agentId), ctx.previous);
    },
    onSettled: (_d, _e, { agentId }) =>
      qc.invalidateQueries({ queryKey: agentKeys.skills(agentId) }),
  });
}

/** Dynamic model list for a provider (editor model picker). */
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: agentKeys.providerModels.list(provider),
    queryFn: () => api.get(`/providers/${provider}/models`, ModelInfo.array()),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}
