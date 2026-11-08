"use client";

import { useTranslations } from "next-intl";
import type { BlastDownstream } from "@/lib/types";
import { GRAPH_ROW_HEIGHT, GRAPH_WIDTH, LEGEND, NODE_HEIGHT } from "./constants";
import { edgePath, layoutBlastGraph } from "./helpers";
import { s, STROKE } from "./styles";

/** Read-only node-link view of the blast radius (layout is a pure helper, computed during render). */
export function BlastGraph({ downstream }: { downstream: BlastDownstream[] }) {
  const t = useTranslations("blast");
  if (downstream.length === 0) return <p style={s.empty}>{t("graph.empty")}</p>;

  const { nodes, edges, height, hidden } = layoutBlastGraph(downstream, { rowHeight: GRAPH_ROW_HEIGHT });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hasCrons = downstream.some((d) => d.crons_affected.length > 0);

  return (
    <div style={s.root}>
      <svg
        role="img"
        aria-label={t("graph.ariaLabel")}
        viewBox={`0 0 ${GRAPH_WIDTH} ${height}`}
        width="100%"
        style={{ ...s.svg, aspectRatio: `${GRAPH_WIDTH} / ${height}` }}
      >
        {edges.map((e) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          return (
            <path
              key={e.id}
              d={edgePath(a, b)}
              fill="none"
              stroke={e.indirect ? "var(--border)" : "var(--border-strong)"}
              strokeWidth={1.5}
              strokeDasharray={e.indirect ? "4 3" : undefined}
            />
          );
        })}
        {nodes.map((n) => (
          <g key={n.id} transform={`translate(${n.x - n.width / 2},${n.y - NODE_HEIGHT / 2})`}>
            <title>{n.title}</title>
            <rect width={n.width} height={NODE_HEIGHT} rx={6} fill="var(--bg-elevated)" stroke={STROKE[n.kind]} strokeWidth={1.25} />
            <text x={n.width / 2} y={17} textAnchor="middle" style={s.label}>
              {n.label}
            </text>
          </g>
        ))}
      </svg>
      <div style={s.legend}>
        {LEGEND.map(({ kind, key }) => (
          <span key={kind} style={s.legendItem}>
            <span aria-hidden style={{ ...s.dot, borderColor: STROKE[kind] }} />
            {t(`graph.legend.${key}`)}
          </span>
        ))}
      </div>
      {hidden > 0 && <p style={s.note}>{t("graph.truncated", { count: hidden })}</p>}
      {hasCrons && <p style={s.note}>{t("graph.cronsHint")}</p>}
    </div>
  );
}
