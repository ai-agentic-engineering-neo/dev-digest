import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions — thin route entry. The screen, its
   candidate cards, create-skill modal, styles and helpers are colocated
   under _components/ConventionsView. */
export default function ConventionsPage() {
  return <ConventionsView />;
}
