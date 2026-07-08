import { MultiAgentLanding } from "./_components/MultiAgentLanding";

/* Route: /multi-agent-review. The GLOBAL nav has no PR context, so the landing
   reopens the last run (or ?new / first-run → the configure form). Thin route
   entry — logic, styles and helpers are colocated under _components. */
export default function MultiAgentReviewPage() {
  return <MultiAgentLanding />;
}
