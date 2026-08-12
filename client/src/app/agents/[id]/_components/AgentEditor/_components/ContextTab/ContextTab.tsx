"use client";

import type { Agent } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import { useEntityDocuments, useSetEntityDocumentAttached, useSetEntityDocuments } from "@/lib/hooks/project-context";
import { ContextTab as SharedContextTab } from "@/components/context-tab";

/**
 * specs/09-project-context-folder.md — the agent editor's Context tab. Thin
 * wrapper: resolves the agent-specific data hooks (`agentId`-keyed) and the
 * `"agents"` i18n namespace, then hands everything else to the shared
 * `ContextTab` (`src/components/context-tab`) — see that component's doc
 * comment for the full rationale (union-of-catalog-and-attachments row
 * model, the unfiltered token total, the position-announcing reorder
 * control). The skill editor's `ContextTab` is this file's sibling, wired
 * the same way against `"skill"`/`"skills"` instead.
 */
export function ContextTab({ agent }: { agent: Agent }) {
  const { activeRepo } = useActiveRepo();
  const repoId = activeRepo?.id ?? null;

  const { data: attachments } = useEntityDocuments("agent", agent.id);
  const setAttached = useSetEntityDocumentAttached("agent");
  const setDocuments = useSetEntityDocuments("agent");

  return (
    <SharedContextTab
      namespace="agents"
      repoId={repoId}
      attachments={attachments}
      onToggle={(path, attached) => {
        if (!repoId) return;
        setAttached.mutate({ id: agent.id, repoId, path, attached });
      }}
      onReorder={(documents, { onSettled }) => {
        setDocuments.mutate({ id: agent.id, documents }, { onSettled });
      }}
    />
  );
}
