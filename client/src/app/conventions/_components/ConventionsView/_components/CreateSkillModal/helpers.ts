import type { Agent } from "@devdigest/shared";
import { DEFAULT_LINK_AGENT_NAME } from "../../constants";

/** The agent the extracted skill links to unless the user picks another one. */
export function preferredAgentId(agents: readonly Pick<Agent, "id" | "name">[] | undefined): string {
  if (!agents || agents.length === 0) return "";
  return (agents.find((a) => a.name === DEFAULT_LINK_AGENT_NAME) ?? agents[0]!).id;
}
