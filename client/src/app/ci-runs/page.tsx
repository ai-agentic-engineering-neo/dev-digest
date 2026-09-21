import type { Metadata } from "next";
import { CiRunsView } from "./_components/CiRunsView";

/* Route: /ci-runs — thin route entry. specs/14-export-to-ci.md AC-26…AC-32:
   workspace-scoped (NOT repo-scoped), lists CI-ingested agent reviews. The
   table, filters, auto-refresh control and styles are colocated under
   _components/CiRunsView. */
export const metadata: Metadata = { title: "CI Runs — DevDigest" };

export default function CiRunsPage() {
  return <CiRunsView />;
}
