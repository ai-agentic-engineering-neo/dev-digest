/* BlastGraph — the same map as the tree, drawn as three columns: changed
   symbols → callers → the endpoints and crons they reach. Pure SVG, no library. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import { kindsByName, symbolLabel } from "../../helpers";
import { edgePath, layoutGraph } from "./helpers";
import { STROKE, s } from "./styles";

export function BlastGraph({ data }: { data: BlastRadius }) {
  const t = useTranslations("blast");
  const kinds = React.useMemo(() => kindsByName(data), [data]);
  const layout = React.useMemo(
    () =>
      layoutGraph(
        data,
        (name) => symbolLabel(name, kinds),
        (n) => t("moreCallers", { count: n }),
      ),
    [data, kinds, t],
  );

  if (data.downstream.length === 0) return <div style={s.empty}>{t("graph.empty")}</div>;

  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  return (
    <div>
      <svg
        role="img"
        aria-label={t("graph.ariaLabel")}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={s.svg}
      >
        <g fill="none" stroke="var(--border-strong)" strokeWidth={1.2} opacity={0.8}>
          {layout.edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            return <path key={`${e.from}>${e.to}`} d={edgePath(a, b, layout.nodeWidth, layout.nodeHeight)} />;
          })}
        </g>
        {layout.nodes.map((n) => (
          <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
            <title>{n.title}</title>
            <rect
              width={layout.nodeWidth}
              height={layout.nodeHeight}
              rx={6}
              fill="var(--bg-elevated)"
              stroke={STROKE[n.kind]}
              strokeWidth={n.kind === "symbol" ? 1.5 : 1}
              strokeDasharray={n.kind === "more" ? "3 3" : undefined}
            />
            <text
              x={layout.nodeWidth / 2}
              y={layout.nodeHeight / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="var(--font-mono)"
              fontSize={11}
              fill={n.kind === "more" ? "var(--text-muted)" : "var(--text-primary)"}
            >
              {n.label}
            </text>
          </g>
        ))}
      </svg>
      <div style={s.legend}>
        <span style={s.legendItem}>
          <span style={s.dot(STROKE.symbol)} />
          {t("graph.legend.symbol")}
        </span>
        <span style={s.legendItem}>
          <span style={s.dot(STROKE.caller)} />
          {t("graph.legend.callers")}
        </span>
        <span style={s.legendItem}>
          <span style={s.dot(STROKE.endpoint)} />
          {t("graph.legend.endpoints")}
        </span>
        <span style={s.legendItem}>
          <span style={s.dot(STROKE.cron)} />
          {t("graph.legend.crons")}
        </span>
      </div>
    </div>
  );
}
