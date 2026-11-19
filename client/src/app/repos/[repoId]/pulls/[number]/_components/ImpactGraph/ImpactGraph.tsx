/* ImpactGraph — Graph view of the Blast Radius card (specs/18 AC-40…43).
   Pure presentation over the server-built `graph`; layout/render lives in the
   shared graph-canvas. Type-only filtering re-queries the server (parent owns
   `includeTypeOnly`); hide-inferred is a client-side filter. */
"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { BlastGraph } from "@devdigest/shared";
import { GraphCanvasLazy, LiveRegion, symbolDisplayName, useAnnouncer } from "@/components/graph-canvas";
import { NodeDetail } from "./NodeDetail";
import { nodeLine, pathToChanged, toCanvasEdges, toCanvasNodes, visibleEdges, visibleNodes } from "./helpers";
import { s } from "./styles";

interface ImpactGraphProps {
  graph: BlastGraph;
  repoFullName?: string | null;
  headSha?: string | null;
  includeTypeOnly: boolean;
  onIncludeTypeOnlyChange: (v: boolean) => void;
  /** True while a filter re-query is in flight. */
  isUpdating?: boolean;
}

export function ImpactGraph({
  graph,
  repoFullName,
  headSha,
  includeTypeOnly,
  onIncludeTypeOnlyChange,
  isUpdating,
}: ImpactGraphProps) {
  const t = useTranslations("impactGraph");
  const tCanvas = useTranslations("graph");
  const [hideInferred, setHideInferred] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { message, announce } = useAnnouncer();

  const edges = useMemo(() => visibleEdges(graph.edges, hideInferred), [graph.edges, hideInferred]);
  const nodes = useMemo(() => visibleNodes(graph.nodes, edges), [graph.nodes, edges]);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const highlight = useMemo(
    () => (selected ? pathToChanged(selected.id, nodes, edges) : null),
    [selected, nodes, edges],
  );
  const canvasNodes = useMemo(
    () => toCanvasNodes(nodes, selected?.id ?? null, highlight, tCanvas("tag.type"), tCanvas("moduleScope")),
    [nodes, selected, highlight, tCanvas],
  );
  const canvasEdges = useMemo(() => toCanvasEdges(edges, highlight), [edges, highlight]);

  const onSelect = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    setSelectedId(id);
    if (n) announce(t("graph.announceSelected", { name: symbolDisplayName(n.name, tCanvas("moduleScope")) }));
  };
  const clear = () => {
    setSelectedId(null);
    announce(t("graph.announceCleared"));
  };

  return (
    <div style={s.wrap}>
      <div role="group" aria-label={t("graph.filters")} style={s.filters}>
        <label style={s.filterLabel}>
          <input
            type="checkbox"
            checked={includeTypeOnly}
            onChange={(e) => onIncludeTypeOnlyChange(e.target.checked)}
          />
          {t("graph.showTypeOnly")}
        </label>
        <label style={s.filterLabel}>
          <input type="checkbox" checked={hideInferred} onChange={(e) => setHideInferred(e.target.checked)} />
          {t("graph.hideInferred")}
        </label>
        {isUpdating && <span>{t("state.updating")}</span>}
      </div>

      {nodes.length === 0 ? (
        <div style={s.empty}>{t("state.graphEmpty")}</div>
      ) : (
        <div style={s.body}>
          <GraphCanvasLazy
            nodes={canvasNodes}
            edges={canvasEdges}
            ariaLabel={t("graph.ariaLabel")}
            onSelect={onSelect}
            announcement={t("graph.announceLoaded", { nodes: nodes.length, edges: edges.length })}
          />
          <NodeDetail
            node={selected}
            line={selected ? nodeLine(selected, edges) : undefined}
            repoFullName={repoFullName}
            headSha={headSha}
            onClose={clear}
          />
        </div>
      )}
      <LiveRegion message={message} />
    </div>
  );
}
