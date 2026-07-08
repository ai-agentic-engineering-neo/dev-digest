/* MultiAgentLanding — the GLOBAL "Multi-Agent Review" nav has no PR context, so
   landing here should reopen the LAST run (spec) rather than always showing the
   "configure run" form. This client wrapper queries the workspace's latest run:
   - `?new` present  → user explicitly wants a fresh run → show ConfigureRunView.
   - a latest run    → redirect to its results view.
   - no runs yet     → show ConfigureRunView (first-run experience). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useLatestMultiAgentRun } from "@/lib/hooks";
import { ConfigureRunView } from "../ConfigureRun";

export function MultiAgentLanding() {
  const t = useTranslations("multiAgentReview");
  const router = useRouter();
  const search = useSearchParams();
  const forceNew = search.get("new") != null;

  const { data: latest, isLoading } = useLatestMultiAgentRun({ enabled: !forceNew });

  React.useEffect(() => {
    if (forceNew || !latest) return;
    router.replace(`/multi-agent-review/${latest.pr_id}?multiRunId=${latest.id}`);
  }, [forceNew, latest, router]);

  // Explicit "start new review", or no history yet → the configure form.
  if (forceNew || (!isLoading && !latest)) return <ConfigureRunView />;

  // Loading the latest run, or redirecting to it — brief placeholder.
  return (
    <AppShell crumb={[{ label: t("crumbLabel") }, { label: t("crumb") }]}>
      <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        <Skeleton height={240} />
      </div>
    </AppShell>
  );
}
