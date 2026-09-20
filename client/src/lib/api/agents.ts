/* api/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { Agent, ModelInfo } from "@devdigest/shared";
import type { Provider, ReviewStrategy } from "@devdigest/shared";

export const agentKeys = {
  all: ["agents"] as const,
  detail: (id: string | null | undefined) => ["agent", id] as const,
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
    mutationFn: (input: CreateAgentInput) => api.post("/agents", input, Agent),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.all }),
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
    mutationFn: ({ id, patch }: UpdateAgentInput) => api.put(`/agents/${id}`, patch, Agent),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: agentKeys.all });
      qc.setQueryData(agentKeys.detail(data.id), data);
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    // TODO(step 3): parse with contract schema
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/agents/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: agentKeys.all });
      qc.removeQueries({ queryKey: agentKeys.detail(id) });
    },
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
