"use client";

import React from "react";
import { Badge, Icon, type IconName } from "@devdigest/ui";
import type { RunSummary, PrCommit } from "@devdigest/shared";

/**
 * PR timeline — every agent run (any status: done / failed / cancelled /
 * running) interleaved with the PR's commits, newest-first and DB-backed so it
 * survives reload. Showing commits between runs makes it clear which commit
 * each review ran against (a review on an older commit covered different files).
 * Failed runs show their error inline; clicking a run row opens its trace.
 */

const STATUS: Record<string, { color: string; bg: string; icon: IconName }> = {
  done: { color: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle" },
  failed: { color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" },
  cancelled: { color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "X" },
  running: { color: "var(--accent)", bg: "var(--accent-bg)", icon: "RefreshCw" },
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  cursor: "pointer",
  textAlign: "left",
};

// Commits are markers, not actions — lighter (dashed, transparent) so they read
// as separators between the runs they sit chronologically between.
const commitRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px dashed var(--border)",
  background: "transparent",
};

type TimelineItem =
  | { kind: "run"; ts: number; run: RunSummary }
  | { kind: "commit"; ts: number; commit: PrCommit };

/** Epoch ms for sorting; unparseable / missing timestamps sort last. */
function tsOf(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Date.parse(s);
  return Number.isNaN(n) ? 0 : n;
}

export function RunHistory({
  runs,
  commits = [],
  onOpenTrace,
  onDelete,
}: {
  runs: RunSummary[];
  commits?: PrCommit[];
  onOpenTrace: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  if (runs.length === 0 && commits.length === 0) return null;

  const items: TimelineItem[] = [
    ...runs.map((run) => ({ kind: "run" as const, ts: tsOf(run.ran_at), run })),
    ...commits.map((commit) => ({
      kind: "commit" as const,
      ts: tsOf(commit.committed_at),
      commit,
    })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => {
        if (item.kind === "commit") {
          const c = item.commit;
          return (
            <div key={`commit:${c.sha}`} style={commitRowStyle}>
              <Icon.GitCommit size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <span className="mono" style={{ fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>
                {c.sha.slice(0, 7)}
              </span>
              <span
                style={{
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={c.message}
              >
                {c.message.split("\n")[0]}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>{c.author}</span>
              {c.committed_at && (
                <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                  {new Date(c.committed_at).toLocaleTimeString()}
                </span>
              )}
            </div>
          );
        }

        const r = item.run;
        const st = STATUS[r.status ?? ""] ?? STATUS.cancelled!;
        const tok = (r.tokens_in ?? 0) + (r.tokens_out ?? 0);
        return (
          <button key={`run:${r.run_id}`} onClick={() => onOpenTrace(r.run_id)} style={rowStyle}>
            <Badge color={st.color} bg={st.bg} icon={st.icon}>
              {r.status ?? "—"}
            </Badge>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                {r.agent_name ?? "Agent"}{" "}
                <span className="mono" style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)" }}>
                  {r.provider}/{r.model}
                </span>
              </div>
              {r.status === "failed" && r.error && (
                <div
                  style={{ fontSize: 12, color: "var(--crit)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={r.error}
                >
                  {r.error}
                </div>
              )}
              {r.status === "done" && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {r.findings_count ?? 0} finding(s){r.grounding ? ` · ${r.grounding}` : ""}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
              {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
              {tok > 0 && (
                <span className="mono">
                  {tok} tok{r.cost_usd != null ? ` · $${r.cost_usd.toFixed(4)}` : ""}
                </span>
              )}
            </div>
            <Icon.FileText size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            {onDelete && r.status !== "running" && (
              <span
                role="button"
                aria-label="Delete run"
                title="Delete run"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(r.run_id);
                }}
                style={{ display: "inline-flex", padding: 3, borderRadius: 5, color: "var(--text-muted)", flexShrink: 0 }}
              >
                <Icon.Trash size={13} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
