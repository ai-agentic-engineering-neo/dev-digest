/* ImpactGraph — Graph view of the Blast Radius card (specs/18 AC-40…43).
   Pure presentation over the server-built `graph`; layout/render lives in the
   shared graph-canvas. Type-only filtering re-queries the server (parent owns
   `includeTypeOnly`); hide-inferred is a client-side filter. Clicking a node
   (or a neighbour in the side panel) selects it, highlights its path to the
   changed code and pans the canvas to it; Esc / a click on empty canvas
   clears the selection. */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { BlastGraph } from "@devdigest/shared";
import { GraphCanvasLazy, LiveRegion, symbolDisplayName, useAnnouncer } from "@/components/graph-canvas";
import { HelpTip } from "@/components/help-tip";
import { NodeDetail } from "./NodeDetail";
import { GRAPH_HEIGHT } from "./constants";
import {
  neighbours,
  nodeLine,
  pathToChanged,
  shortestPathToChanged,
  toCanvasEdges,
  toCanvasNodes,
  visibleEdges,
  visibleNodes,
} from "./helpers";
import { s } from "./styles";

interface ImpactGraphProps {
  graph: BlastGraph;
  repoFullName?: string | null;
  headSha?: string | null;
  includeTypeOnly: boolean;
  onIncludeTypeOnlyChange: (v: boolean) => void;
  /** True while a filter re-query is in flight. */
  isUpdating?: boolean;
  /** Opens a changed file in the Files tab. */
  onFocusFile?: (file: string, line: number | null) => void;
}

export function ImpactGraph({
  graph,
  repoFullName,
  headSha,
  includeTypeOnly,
  onIncludeTypeOnlyChange,
  isUpdating,
  onFocusFile,
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
  const detail = useMemo(
    () =>
      selected
        ? { nb: neighbours(selected.id, nodes, edges), path: shortestPathToChanged(selected.id, nodes, edges) }
        : null,
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
    if (selectedId == null) return;
    setSelectedId(null);
    announce(t("graph.announceCleared"));
  };

  // Esc clears the selection from anywhere on the page while one is active.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null);
        announce(t("graph.announceCleared"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, announce, t]);

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
        <HelpTip topic="typeOnlyEdges" size={12} />
        <label style={s.filterLabel}>
          <input type="checkbox" checked={hideInferred} onChange={(e) => setHideInferred(e.target.checked)} />
          {t("graph.hideInferred")}
        </label>
        <HelpTip topic="inferredEdges" size={12} />
        <span style={s.updating}>{isUpdating ? t("state.updating") : t("graph.hint")}</span>
      </div>

      {nodes.length === 0 ? (
        <div style={s.empty}>{t("state.graphEmpty")}</div>
      ) : (
        <div style={s.body}>
          <div style={s.canvasCell}>
            <GraphCanvasLazy
              nodes={canvasNodes}
              edges={canvasEdges}
              ariaLabel={t("graph.ariaLabel")}
              onSelect={onSelect}
              onPaneClick={clear}
              focusId={selectedId}
              height={GRAPH_HEIGHT}
              announcement={t("graph.announceLoaded", { nodes: nodes.length, edges: edges.length })}
            />
          </div>
          <div style={s.detailCell}>
            <NodeDetail
              node={selected}
              line={selected ? nodeLine(selected, edges) : undefined}
              neighbours={detail?.nb ?? null}
              path={detail?.path ?? []}
              repoFullName={repoFullName}
              headSha={headSha}
              onSelect={onSelect}
              onClose={clear}
              onFocusFile={onFocusFile}
            />
          </div>
        </div>
      )}
      <LiveRegion message={message} />
    </div>
  );
}
