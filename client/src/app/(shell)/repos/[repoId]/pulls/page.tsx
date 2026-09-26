import { PullsListView } from "./_components/PullsListView";

/* Route: /repos/:repoId/pulls (PR list). Thin route entry — the view lives in
   _components/PullsListView. The status filter lives in the URL (?status); sort
   and search are local state. */
export default function PullsPage() {
  return <PullsListView />;
}
