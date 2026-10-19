/* Route: /agents — two-pane Agents screen. With agents it opens the first one
   in the editor; without, the right pane is the "No agents yet" empty state. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@devdigest/ui";
import { useAgents } from "../../lib/hooks/agents";
import { AgentsEmptyState, AgentsWorkspace } from "./_components/AgentsWorkspace";

export default function AgentsPage() {
  const router = useRouter();
  const { data: agents, isLoading } = useAgents();
  const first = agents?.[0];

  React.useEffect(() => {
    if (first) router.replace(`/agents/${first.id}?tab=config`);
  }, [first, router]);

  return (
    <AgentsWorkspace>
      {isLoading || first ? (
        <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton height={24} width={240} />
          <Skeleton height={200} />
        </div>
      ) : (
        <AgentsEmptyState />
      )}
    </AgentsWorkspace>
  );
}
