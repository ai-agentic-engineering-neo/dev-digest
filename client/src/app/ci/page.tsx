import { CiRunsView } from "./_components/CiRunsView";

/* Route: /ci (global CI Runs). Thin route entry — the view, its columns,
   helpers and i18n are colocated under _components/CiRunsView. */
export default function CiRunsPage() {
  return <CiRunsView />;
}
