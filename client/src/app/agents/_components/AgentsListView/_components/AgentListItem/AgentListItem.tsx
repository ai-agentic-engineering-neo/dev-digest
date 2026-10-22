/* AgentListItem — AgentCard for the /agents grid, enriched with the agent's
   linked-skill count (shares the ["agent-skills", id] cache with the editor). */
"use client";

import React from "react";
import type { Agent } from "@devdigest/shared";
import { useAgentSkillLinks } from "../../../../../../lib/hooks/skills";
import { AgentCard } from "../../../AgentCard";

export function AgentListItem({
  ag,
  onClick,
  onToggle,
}: {
  ag: Agent;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const { data: links } = useAgentSkillLinks(ag.id);
  return <AgentCard ag={ag} skillCount={links?.length} onClick={onClick} onToggle={onToggle} />;
}
