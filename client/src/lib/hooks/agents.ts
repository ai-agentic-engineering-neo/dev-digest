/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Agent, AgentSkillDetail, ModelInfo, Provider, ReviewStrategy } from "@devdigest/shared";

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

/** Dynamic model list for a provider (editor model picker). */
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: ["provider-models", provider],
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}

/** An agent's linked skills, joined with per-link order + enabled (Skills tab). */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillDetail[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

export interface SetAgentSkillsInput {
  agentId: string;
  /** The FULL ordered set the agent should end up with — the mutation posts
   *  it verbatim as `{ skills: [{skill_id, enabled}, ...] }` and also uses it
   *  as the optimistic cache value, so callers pass the list they already
   *  computed (toggled or reordered) rather than a delta. */
  skills: AgentSkillDetail[];
}

/** Replaces an agent's whole skill set (link + order + per-link enabled) in one
 *  call — used by both the checkbox toggle and the ↑/↓ / drag reorder actions. */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skills }: SetAgentSkillsInput) =>
      api.post<AgentSkillDetail[]>(`/agents/${agentId}/skills`, {
        skills: skills.map((sk) => ({ skill_id: sk.id, enabled: sk.link_enabled })),
      }),
    onMutate: async ({ agentId, skills }) => {
      await qc.cancelQueries({ queryKey: ["agent-skills", agentId] });
      const previous = qc.getQueryData<AgentSkillDetail[]>(["agent-skills", agentId]);
      qc.setQueryData(["agent-skills", agentId], skills);
      return { previous, agentId };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) qc.setQueryData(["agent-skills", ctx.agentId], ctx.previous);
    },
    onSettled: (_data, _err, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["agent-skills", agentId] });
    },
  });
}
