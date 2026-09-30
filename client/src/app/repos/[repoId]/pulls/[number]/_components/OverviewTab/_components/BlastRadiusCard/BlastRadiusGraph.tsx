/* BlastRadiusGraph — node-link view of one changed symbol's blast radius:
   symbol -> its resolved callers -> the endpoints/crons reached. No graph
   library (none of @devdigest/ui's deps render an interactive DAG) — this is
   a small hand-built inline-SVG diagram: <line> edges, <foreignObject> nodes
   so labels get normal HTML text handling (wrap/ellipsis) and real click
   targets, instead of hand-measuring SVG <text>.

   Honesty note: the wire contract (`DownstreamImpact`) attributes
   endpoints/crons to the SYMBOL, not to any one specific caller (see
   `blast/helpers.ts`'s comment on why per-file attribution was dropped as
   noise) — so caller nodes fan into a single junction that then fans out to
   every endpoint, rather than drawing a false precise caller-to-endpoint
   line neither this component nor the API actually has evidence for. */
"use client";

import React from "react";
import { MonoLink } from "@devdigest/ui";
import type { DownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "../../../../../../../../../lib/github-urls";

const ROW_H = 34;
const ROW_GAP = 8;
const COL_W = 168;
const COL_GAP = 56;
const PAD = 16;
const MAX_ENDPOINT_NODES = 10;

interface Props {
  symbol: string;
  symbolFile: string;
  impact: DownstreamImpact;
  repoFullName: string | null;
  headSha: string | null | undefined;
}

export function BlastRadiusGraph({ symbol, symbolFile, impact, repoFullName, headSha }: Props) {
  const callers = impact.callers;
  const allTargets = [...impact.endpoints_affected, ...impact.crons_affected.map((c) => `⏱ ${c}`)];
  const truncated = allTargets.length > MAX_ENDPOINT_NODES;
  const targets = truncated ? allTargets.slice(0, MAX_ENDPOINT_NODES - 1) : allTargets;
  const targetLabels = truncated ? [...targets, `+${allTargets.length - targets.length} more`] : targets;

  const rows = Math.max(1, callers.length, targetLabels.length);
  const height = rows * ROW_H + (rows - 1) * ROW_GAP + PAD * 2;
  const width = PAD * 2 + COL_W * 3 + COL_GAP * 2;

  const colX = [PAD, PAD + COL_W + COL_GAP, PAD + (COL_W + COL_GAP) * 2];
  const centerY = height / 2;
  const symbolY = centerY - ROW_H / 2;
  const junctionX = colX[1]! - COL_GAP / 2;

  const callerY = (i: number) => centerY - (callers.length * (ROW_H + ROW_GAP) - ROW_GAP) / 2 + i * (ROW_H + ROW_GAP);
  const targetY = (i: number) =>
    centerY - (targetLabels.length * (ROW_H + ROW_GAP) - ROW_GAP) / 2 + i * (ROW_H + ROW_GAP);

  const symbolHref =
    repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, symbolFile) : undefined;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        data-testid="blast-radius-graph"
        width={width}
        height={height}
        style={{ display: "block", minWidth: width }}
      >
        {/* edges: symbol -> each caller */}
        {callers.map((c, i) => (
          <line
            key={`sc-${i}`}
            x1={colX[0]! + COL_W}
            y1={symbolY + ROW_H / 2}
            x2={colX[1]!}
            y2={callerY(i) + ROW_H / 2}
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}
        {/* edges: callers -> shared junction -> each target (see honesty note above) */}
        {callers.length > 0 &&
          targetLabels.length > 0 &&
          callers.map((_, i) => (
            <line
              key={`cj-${i}`}
              x1={colX[1]! + COL_W}
              y1={callerY(i) + ROW_H / 2}
              x2={junctionX + COL_GAP / 2}
              y2={centerY}
              stroke="var(--border)"
              strokeWidth={1}
            />
          ))}
        {callers.length > 0 &&
          targetLabels.map((_, i) => (
            <line
              key={`jt-${i}`}
              x1={junctionX + COL_GAP / 2}
              y1={centerY}
              x2={colX[2]!}
              y2={targetY(i) + ROW_H / 2}
              stroke="var(--border)"
              strokeWidth={1}
            />
          ))}

        {/* changed symbol node */}
        <foreignObject x={colX[0]} y={symbolY} width={COL_W} height={ROW_H}>
          <GraphNode label={`${symbol}()`} href={symbolHref} tone="symbol" />
        </foreignObject>

        {/* caller nodes */}
        {callers.map((c, i) => (
          <foreignObject key={`c-${i}`} x={colX[1]} y={callerY(i)} width={COL_W} height={ROW_H}>
            <GraphNode
              label={c.name}
              href={
                repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, c.file, c.line) : undefined
              }
              tone="caller"
            />
          </foreignObject>
        ))}

        {/* endpoint/cron nodes */}
        {targetLabels.map((label, i) => (
          <foreignObject key={`t-${i}`} x={colX[2]} y={targetY(i)} width={COL_W} height={ROW_H}>
            <GraphNode label={label} tone="target" mono={!label.startsWith("+")} />
          </foreignObject>
        ))}
      </svg>
    </div>
  );
}

function GraphNode({
  label,
  href,
  tone,
  mono,
}: {
  label: string;
  href?: string;
  tone: "symbol" | "caller" | "target";
  mono?: boolean;
}) {
  const borderColor = tone === "caller" ? "var(--border)" : "var(--accent, #5b8def)";
  const body = (
    <div
      title={label}
      style={{
        boxSizing: "border-box",
        height: ROW_H - 6,
        margin: "3px 4px",
        padding: "0 10px",
        display: "flex",
        alignItems: "center",
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        background: "var(--bg-surface)",
        fontSize: 12,
        color: "var(--text-primary)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
      className={mono ? "mono" : undefined}
    >
      {label}
    </div>
  );
  if (!href) return body;
  return (
    <MonoLink href={href}>
      <span style={{ display: "block" }}>{body}</span>
    </MonoLink>
  );
}
