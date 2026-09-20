/* api/skills.ts — React Query hooks for the Skills library (list + editor). */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { CreateSkillInput, Skill, SkillVersion, UpdateSkillInput } from "@devdigest/shared";

export const skillKeys = {
  all: ["skills"] as const,
  detail: (id: string | null | undefined) => ["skill", id] as const,
  versions: (id: string | null | undefined) => ["skill", id, "versions"] as const,
};

export function useSkills() {
  return useQuery({ queryKey: skillKeys.all, queryFn: () => api.get("/skills", Skill.array()) });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.detail(id),
    queryFn: () => api.get(`/skills/${id}`, Skill),
    enabled: !!id,
  });
}

/** Body snapshots, newest version first. */
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.versions(id),
    queryFn: () => api.get(`/skills/${id}/versions`, SkillVersion.array()),
    enabled: !!id,
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post("/skills", input, Skill),
    onSuccess: () => qc.invalidateQueries({ queryKey: skillKeys.all }),
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSkillInput }) =>
      api.put(`/skills/${id}`, patch, Skill),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: skillKeys.all });
      qc.setQueryData(skillKeys.detail(data.id), data);
      // A body change appends a version; metadata edits do not, but refetching
      // an already-cached short list is cheaper than tracking which happened.
      qc.invalidateQueries({ queryKey: skillKeys.versions(data.id) });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: skillKeys.all });
      qc.removeQueries({ queryKey: skillKeys.detail(id) });
    },
  });
}
