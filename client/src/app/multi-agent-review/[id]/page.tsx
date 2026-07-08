import { ResultsView } from "./_components/ResultsView";

/* Route: /multi-agent-review/:id — the results view for a PR's multi-agent
   run. `:id` is the PR id (Q1); an optional `?multiRunId=` search param
   targets a specific run, defaulting to the most recent for that PR. */
export default function MultiAgentResultsPage() {
  return <ResultsView />;
}
