/* ContextTab — "Project context to use": repo documents attached to the skill.
   Every agent that links (and enables) this skill inherits them. */
"use client";

import React from "react";
import type { Skill } from "@devdigest/shared";
import { ContextDocsPicker } from "@/components/project-context";
import { useSetSkillContext, useSkillContext } from "@/lib/hooks/context";
import { useActiveRepo } from "@/lib/repo-context";

export function ContextTab({ skill }: { skill: Skill }) {
  const { repoId, activeRepo } = useActiveRepo();
  const { data: ctx } = useSkillContext(skill.id);
  const setContext = useSetSkillContext();

  return (
    <ContextDocsPicker
      mode="skill"
      repoId={repoId ?? null}
      repoName={activeRepo?.full_name ?? ""}
      own={ctx?.paths ?? skill.context_paths ?? []}
      onChange={(paths) => setContext.mutate({ skillId: skill.id, paths })}
    />
  );
}
