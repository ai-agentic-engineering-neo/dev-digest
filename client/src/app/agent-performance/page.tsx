import type { Metadata } from "next";
import { AgentPerfView } from "./_components/AgentPerfView";

/* Route: /agent-performance — thin route entry. specs/14-export-to-ci.md
   AC-40…AC-47: workspace-scoped (NOT repo-scoped), unifying `source: 'local'`
   and `source: 'ci'` agent runs into one productionization view. The
   summary tiles, sortable table, cost breakdowns, range selector and styles
   are colocated under _components/AgentPerfView. */
export const metadata: Metadata = { title: "Agent Performance — DevDigest" };

export default function AgentPerformancePage() {
  return <AgentPerfView />;
}
