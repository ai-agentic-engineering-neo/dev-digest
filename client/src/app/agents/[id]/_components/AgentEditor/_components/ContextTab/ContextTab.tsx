/* ContextTab — attach repo markdown documents to the agent (Project Context).
   Documents come from the active repo; inherited rows come from the agent's
   linked + enabled skills. Paths are stored, never text. */
"use client";

import React from "react";
import type { Agent } from "@devdigest/shared";
import { ContextDocsPicker } from "@/components/project-context";
import { useAgentContext, useSetAgentContext } from "@/lib/hooks/context";
import { useProviderModels } from "@/lib/hooks/agents";
import { useActiveRepo } from "@/lib/repo-context";

export function ContextTab({ agent }: { agent: Agent }) {
  const { repoId, activeRepo } = useActiveRepo();
  const { data: ctx } = useAgentContext(agent.id);
  const setContext = useSetAgentContext();
  const { data: models } = useProviderModels(agent.provider);
  const price = models?.find((m) => m.id === agent.model)?.pricing?.promptPerM ?? null;

  return (
    <ContextDocsPicker
      mode="agent"
      repoId={repoId ?? null}
      repoName={activeRepo?.full_name ?? ""}
      own={ctx?.own ?? agent.context_paths ?? []}
      inherited={ctx?.inherited ?? []}
      promptPricePerM={price}
      onChange={(paths) => setContext.mutate({ agentId: agent.id, paths })}
    />
  );
}
