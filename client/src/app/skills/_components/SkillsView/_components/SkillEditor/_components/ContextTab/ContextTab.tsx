"use client";

import type { Skill } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import { useEntityDocuments, useSetEntityDocumentAttached, useSetEntityDocuments } from "@/lib/hooks/project-context";
import { ContextTab as SharedContextTab } from "@/components/context-tab";

/**
 * specs/09-project-context-folder.md — a skill's own Context tab (US-3,
 * AC-11/AC-12/AC-13): every agent with this skill enabled inherits its
 * attached documents, merged into the SAME `## Project context` block the
 * agent's own attachments render into (D1) — there is no separate "skill
 * specs" section. Thin wrapper: resolves the skill-specific data hooks
 * (`skillId`-keyed) and the `"skills"` i18n namespace, then hands everything
 * else to the shared `ContextTab` (`src/components/context-tab`) — see that
 * component's doc comment for the full rationale. The agent editor's
 * `ContextTab` is this file's sibling, wired the same way against
 * `"agent"`/`"agents"` instead.
 */
export function ContextTab({ skill }: { skill: Skill }) {
  const { activeRepo } = useActiveRepo();
  const { data: attachments } = useEntityDocuments("skill", skill.id);
  // D3 (specs/09-project-context-folder.md) — a skill's attachments all pin
  // to the ONE repo they were attached from, independent of whatever repo is
  // active in the shell right now. Anchor to that repo once the skill has any
  // attachment; only a never-attached skill falls back to the shell's active
  // repo, since there's nothing yet to anchor to.
  const repoId = attachments?.[0]?.repo_id ?? activeRepo?.id ?? null;
  const setAttached = useSetEntityDocumentAttached("skill");
  const setDocuments = useSetEntityDocuments("skill");

  return (
    <SharedContextTab
      namespace="skills"
      repoId={repoId}
      attachments={attachments}
      onToggle={(path, attached) => {
        if (!repoId) return;
        setAttached.mutate({ id: skill.id, repoId, path, attached });
      }}
      onReorder={(documents, { onSettled }) => {
        setDocuments.mutate({ id: skill.id, documents }, { onSettled });
      }}
    />
  );
}
