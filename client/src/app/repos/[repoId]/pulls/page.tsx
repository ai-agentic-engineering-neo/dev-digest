import { PullsListView } from "./_components/PullsListView";

/* Route: /repos/:repoId/pulls (PR list). Thin route entry — the view and its
   filter helpers live in _components/PullsListView; route-wide constants,
   helpers and styles (shared with PRRow/FilterBar) stay next to this file. */
export default function PullsPage() {
  return <PullsListView />;
}
