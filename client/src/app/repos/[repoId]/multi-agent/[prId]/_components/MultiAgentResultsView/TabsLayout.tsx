/* TabsLayout — Screen D. One tab per grouped agent (name + score); the
   active tab shows that run's summary/duration/cost/view-logs affordance,
   and its findings render through the EXISTING FindingsPanel (which itself
   renders FindingCard per finding) with its existing action set — Accept,
   Dismiss, Learn, Turn into eval case (AC-34, D19). No multi-agent-specific
   finding card, and triage here writes through the same finding-action
   route as the PR page (a finding accepted here is accepted there too). */
"use client";

import React from "react";
import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Tabs, Button } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared/contracts/observability";
import type { ReviewRecord } from "@devdigest/shared";
// Cross route-tree reuse (D19/AC-34): the multi-agent tab's findings render
// through the SAME FindingsPanel the PR review page uses, not a copy.
import { FindingsPanel } from "@/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel";
import { agentIdentity } from "@/lib/agent-identity";
import { formatSeconds } from "./helpers";
import { formatCost } from "@/lib/format";

const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  tabBody: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  tabMeta: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  summary: {
    fontSize: 14,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  errorBox: {
    padding: "10px 12px",
    borderRadius: 6,
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
  } satisfies CSSProperties,
};

export function TabsLayout({
  columns,
  reviewByRun,
  onlyConflicts,
  conflictFiles,
  prId,
  repoFullName,
  headSha,
  onOpenTrace,
}: {
  columns: AgentColumn[];
  /** Full FindingRecord[] per run — AgentColumn.findings is a compact subset
   *  (AgentColumnFinding) that can't drive FindingsPanel's triage actions. */
  reviewByRun: Map<string, ReviewRecord>;
  onlyConflicts: boolean;
  conflictFiles: Set<string>;
  prId: string;
  repoFullName: string | null;
  headSha: string | null | undefined;
  onOpenTrace: (runId: string) => void;
}) {
  const t = useTranslations("runs");
  const [active, setActive] = React.useState<string>(columns[0]?.run_id ?? "");
  const activeColumn = columns.find((c) => c.run_id === active) ?? columns[0];
  const activeReview = activeColumn ? reviewByRun.get(activeColumn.run_id) : undefined;
  const allFindings = activeReview?.findings ?? [];
  const findings = onlyConflicts ? allFindings.filter((f) => conflictFiles.has(f.file)) : allFindings;

  return (
    <div style={s.root}>
      <Tabs
        value={activeColumn?.run_id ?? ""}
        onChange={setActive}
        tabs={columns.map((c) => ({
          key: c.run_id,
          label: c.score != null ? `${c.agent_name} · ${c.score}` : c.agent_name,
          icon: agentIdentity(c.agent_id).icon,
        }))}
      />

      {activeColumn && (
        <div style={s.tabBody}>
          <div style={s.tabMeta}>
            <span>{activeColumn.duration_ms != null ? formatSeconds(activeColumn.duration_ms) : "—"}</span>
            <span>{formatCost(activeColumn.cost_usd)}</span>
            <Button kind="ghost" size="sm" icon="FileText" onClick={() => onOpenTrace(activeColumn.run_id)}>
              {t("viewTrace")}
            </Button>
          </div>

          <div style={s.summary}>{activeColumn.summary ?? t("tabs.noSummary")}</div>

          {activeColumn.status === "failed" && activeColumn.error && (
            <div style={s.errorBox}>{activeColumn.error}</div>
          )}

          <FindingsPanel findings={findings} prId={prId} repoFullName={repoFullName} headSha={headSha} />
        </div>
      )}
    </div>
  );
}
