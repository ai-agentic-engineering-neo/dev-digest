/* Route-level error boundary: a render error in any page shows a recoverable
   fallback instead of blanking the app. Runs inside the root layout. */
"use client";

import { RouteError } from "@/components/route-states";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} onRetry={reset} />;
}
