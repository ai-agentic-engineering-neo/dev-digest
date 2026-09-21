import type { Metadata } from "next";
import { EvalDashboardView } from "./_components/EvalDashboardView";

/* Route: /eval — thin route entry. Workspace-scoped Eval Dashboard
   (specs/12-eval-pipeline.md, AC-40). The screen, its rows, table, run-all
   modal, styles and constants are colocated under _components/EvalDashboardView. */
export const metadata: Metadata = { title: "Eval Dashboard — DevDigest" };

export default function EvalPage() {
  return <EvalDashboardView />;
}
