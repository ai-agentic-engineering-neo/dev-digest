/* ResultsView — the Multi-Agent Review results route (T14): reads the run
   via useMultiAgentRun(prId, multiRunId) (Q1: `[id]` is the PR id; an
   optional `?multiRunId=` targets a specific run, defaulting to the most
   recent), keeps the per-agent SSE subscription mounted for the whole run
   duration at THIS level (not inside a view that unmounts on toggle, or live
   events would be lost), and renders ViewToggle + ColumnsView/TabsView +
   DisagreeBlock over one shared result resource. "View trace" mounts the
   existing shared RunTraceDrawer via `?trace=<agent_run id>` (AC-14). */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { FindingActionKind } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import RunTraceDrawer from "@/components/RunTraceDrawer";
import {
  useFindingAction,
  useMultiAgentRun,
  usePrActiveRuns,
  usePrReviews,
  usePrRuns,
} from "@/lib/hooks";
import { useRunEvents } from "@/lib/hooks/reviews";
import { ColumnsView } from "../../../_components/ColumnsView";
import { TabsView } from "../../../_components/TabsView";
import { DisagreeBlock } from "../../../_components/DisagreeBlock";
import { ViewToggle, type ViewMode } from "../../../_components/ViewToggle";
import type { LiveAgentStatus } from "../../../_components/AgentSummary";
import { buildFindingLookup, enrichColumns, resolveColumnStatus } from "../../helpers";
import { s } from "./styles";

export function ResultsView() {
  const t = useTranslations("multiAgentReview");
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const prId = params.id;
  const multiRunId = search.get("multiRunId");
  const traceRunId = search.get("trace");
  const [view, setView] = React.useState<ViewMode>("columns");

  const { data: run, isLoading, isError, refetch } = useMultiAgentRun(prId, multiRunId);
  const { data: reviews } = usePrReviews(prId);
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const action = useFindingAction();

  const runIds = React.useMemo(() => (run?.columns ?? []).map((c) => c.run_id), [run]);
  // Subscribed HERE (page level) so switching Columns/Tabs never tears down
  // the stream — a child component unmounting mid-run would lose events.
  useRunEvents(runIds);

  const statuses = React.useMemo(() => {
    const map: Record<string, LiveAgentStatus> = {};
    for (const col of run?.columns ?? []) {
      map[col.run_id] = resolveColumnStatus(col, prRuns, activeRuns);
    }
    return map;
  }, [run, prRuns, activeRuns]);

  const anyRunning = Object.values(statuses).some((st) => st === "running");

  // The MultiAgentRun resource itself has no built-in polling; while any
  // column is still live, refresh it on the same ~4s cadence as the other
  // run-status polls so findings/conflicts/totals catch up once agents finish.
  React.useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => void refetch(), 4000);
    return () => clearInterval(id);
  }, [anyRunning, refetch]);

  const lookup = React.useMemo(() => buildFindingLookup(reviews), [reviews]);
  const columns = React.useMemo(
    () => (run ? enrichColumns(run.columns, lookup, t("finding.detailsPending")) : []),
    [run, lookup, t],
  );

  const setParam = React.useCallback(
    (key: string, val: string | null) => {
      const sp = new URLSearchParams(search.toString());
      if (val == null) sp.delete(key);
      else sp.set(key, val);
      router.replace(`/multi-agent-review/${prId}${sp.toString() ? `?${sp.toString()}` : ""}`);
    },
    [search, router, prId],
  );

  const handleFindingAction = (
    findingId: string,
    act: Extract<FindingActionKind, "accept" | "dismiss">,
  ) => {
    action.mutate({ findingId, action: act, prId });
  };

  const traceColumn = run?.columns.find((c) => c.run_id === traceRunId);
  const traceFindings = columns.find((c) => c.run_id === traceRunId)?.findings ?? [];

  return (
    <AppShell
      crumb={[
        { label: t("crumbLabel"), href: "/multi-agent-review" },
        { label: t("resultsCrumb") },
      ]}
    >
      <div style={s.page}>
        {isLoading && <Skeleton height={240} />}
        {isError && <ErrorState body={t("loadError")} onRetry={() => refetch()} />}

        {run && (
          <>
            <div style={s.header}>
              <div>
                <h1 style={s.h1}>{t("resultsTitle", { number: run.pr_number ?? 0 })}</h1>
                <p style={s.subtitle}>{t("resultsSubtitle", { count: run.agent_count })}</p>
              </div>
              <div style={s.headerActions}>
                <Button
                  kind="secondary"
                  icon="Sparkles"
                  onClick={() => router.push("/multi-agent-review?new=1")}
                >
                  {t("startNewReview")}
                </Button>
                <ViewToggle value={view} onChange={setView} />
              </div>
            </div>

            {view === "columns" ? (
              <ColumnsView
                columns={columns}
                statuses={statuses}
                pending={action.isPending}
                onFindingAction={handleFindingAction}
                onViewTrace={(runId) => setParam("trace", runId)}
              />
            ) : (
              <TabsView
                columns={columns}
                statuses={statuses}
                pending={action.isPending}
                onFindingAction={handleFindingAction}
                onViewTrace={(runId) => setParam("trace", runId)}
              />
            )}

            <DisagreeBlock conflicts={run.conflicts} />
          </>
        )}
      </div>

      {traceRunId && traceColumn && (
        <RunTraceDrawer
          runId={traceRunId}
          agentName={traceColumn.agent_name}
          prNumber={run?.pr_number}
          findings={traceFindings}
          running={statuses[traceRunId] === "running"}
          onClose={() => setParam("trace", null)}
        />
      )}
    </AppShell>
  );
}
