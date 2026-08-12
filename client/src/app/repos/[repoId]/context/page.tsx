import { ProjectContextView } from "./_components/ProjectContextView";

/* Route: /repos/:repoId/context — thin route entry. The screen, its
   document list/preview, roots control, styles and helpers are colocated
   under _components/ProjectContextView. */
export default function ContextPage() {
  return <ProjectContextView />;
}
