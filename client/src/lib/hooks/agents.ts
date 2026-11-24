/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { queryOptions, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Agent, ModelInfo, Provider, ReviewStrategy } from "@devdigest/shared";

/** Query-options factories for the agents domain: the single source of each
    query key + fetcher. Per-screen knobs (enabled, staleTime) stay in the hooks. */
export const agentQueries = {
  list: () =>
    queryOptions({
      queryKey: ["agents"] as const,
      queryFn: () => api.get<Agent[]>("/agents"),
    }),
  detail: (id: string | null | undefined) =>
    queryOptions({
      queryKey: ["agent", id] as const,
      queryFn: () => api.get<Agent>(`/agents/${id}`),
    }),
  /** Prefix key matching every provider's model list (broad invalidation). */
  providerModelsAll: () => ["provider-models"] as const,
  providerModels: (provider: Provider | null | undefined) =>
    queryOptions({
      queryKey: ["provider-models", provider] as const,
      queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    }),
};

export function useAgents() {
  return useQuery(agentQueries.list());
}

export function useAgent(id: string | null | undefined) {
  return useQuery({
    ...agentQueries.detail(id),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: agentQueries.list().queryKey }),
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
      qc.invalidateQueries({ queryKey: agentQueries.list().queryKey });
      qc.setQueryData(agentQueries.detail(data.id).queryKey, data);
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/agents/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: agentQueries.list().queryKey });
      qc.removeQueries({ queryKey: agentQueries.detail(id).queryKey });
    },
  });
}

/** Dynamic model list for a provider (editor model picker). */
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    ...agentQueries.providerModels(provider),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}
