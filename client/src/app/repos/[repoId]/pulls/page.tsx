import { PullsListView } from "./_components/PullsListView";

/* Route: /repos/:repoId/pulls (PR list). Thin route entry — the view and its logic live in
   _components/PullsListView. */
export default function PullsPage() {
  return <PullsListView />;
}
