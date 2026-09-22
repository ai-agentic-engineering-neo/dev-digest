/* hooks/conventions.ts — React Query hooks for the Conventions screen
   (server/specs/04-conventions.md API table). The state query polls while a
   scan runs; mutations own invalidation (client/specs/04-conventions.md "Hooks"). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Convention,
  ConventionScan,
  ConventionsState,
  CreateConventionSkillInput,
  CreateConventionSkillResult,
  UpdateConventionInput,
} from "@devdigest/shared";
import { api } from "../api";
import { agentKeys, conventionKeys, skillKeys } from "./keys";

/** Poll interval of the state query while a scan is `running`. */
export const CONVENTIONS_POLL_MS = 2_000;

/** ApiError code of an extract request while another scan still runs. */
export const SCAN_RUNNING_CODE = "scan_running";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionKeys.state(repoId),
    queryFn: () => api.get<ConventionsState>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
    refetchInterval: (q) => (q.state.data?.scan?.status === "running" ? CONVENTIONS_POLL_MS : false),
  });
}

/** POST …/extract → 202 running scan. A 409 scan_running just refetches (a scan is already on). */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  const key = conventionKeys.state(repoId);
  return useMutation({
    mutationFn: () => api.post<ConventionScan>(`/repos/${repoId}/conventions/extract`),
    meta: { quietErrorCodes: [SCAN_RUNNING_CODE] },
    onSuccess: (scan) => {
      qc.setQueryData<ConventionsState>(key, (old) => ({ conventions: old?.conventions ?? [], scan }));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export interface UpdateConventionVars {
  id: string;
  patch: UpdateConventionInput;
}

/** PATCH /conventions/:id — optimistic on the repo's state, always refetched after. */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  const key = conventionKeys.state(repoId);
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionVars) => api.patch<Convention>(`/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ConventionsState>(key);
      if (previous) {
        qc.setQueryData<ConventionsState>(key, {
          ...previous,
          conventions: previous.conventions.map((c) =>
            c.id === id
              ? { ...c, ...patch, edited: c.edited || patch.rule !== undefined || patch.category !== undefined }
              : c,
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/** POST …/conventions/skill. 409 `conflict` (duplicate name) is shown inline by the modal. */
export function useCreateConventionSkill(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConventionSkillInput) =>
      api.post<CreateConventionSkillResult>(`/repos/${repoId}/conventions/skill`, input),
    meta: { quietErrorCodes: ["conflict"] },
    onSuccess: ({ skill }) => {
      qc.setQueryData(skillKeys.detail(skill.id), skill);
      qc.invalidateQueries({ queryKey: conventionKeys.state(repoId) });
      qc.invalidateQueries({ queryKey: skillKeys.list() });
      qc.invalidateQueries({ queryKey: skillKeys.agentsAll() });
      // Linking bumps each agent's version and changes its skill list.
      qc.invalidateQueries({ queryKey: agentKeys.all });
    },
  });
}
