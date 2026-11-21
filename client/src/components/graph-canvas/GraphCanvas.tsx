"use client";

import "@xyflow/react/dist/style.css";
import { useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useTranslations } from "next-intl";
import { DEFAULT_ROLES, NODE_HEIGHT, NODE_WIDTH } from "./constants";
import { GraphBanner } from "./GraphBanner";
import { GraphNode } from "./GraphNode";
import { GraphToolbar } from "./GraphToolbar";
import { Legend } from "./Legend";
import { LiveRegion } from "./LiveRegion";
import { edgeLabel, edgeStrokeWidth, layoutExtent } from "./helpers";
import { useElkLayout } from "./useElkLayout";
import type { BannerCondition, GraphEdgeInput, GraphNodeData, GraphNodeInput, GraphRoleDef } from "./types";

export interface GraphCanvasProps {
  nodes: GraphNodeInput[];
  edges: GraphEdgeInput[];
  /** Called on click / Enter / Space on a node. */
  onSelect?: (id: string) => void;
  /** Called on a click on empty canvas (clears the caller's selection). */
  onPaneClick?: () => void;
  /** Node to bring into view (pans/zooms when it changes, e.g. after picking
   *  a neighbour from a detail panel). */
  focusId?: string | null;
  /** Extra or overriding role definitions, keyed by `GraphNodeInput.role`. */
  roles?: Record<string, GraphRoleDef>;
  banners?: BannerCondition[];
  /** Accessible name of the canvas region. */
  ariaLabel: string;
  /** Polite announcement text (see `useAnnouncer`). */
  announcement?: string;
  height?: number | string;
}

const NODE_TYPES = { graph: GraphNode };

/**
 * The `fitView` prop fits once, on first init — when every node still sits at
 * (0,0) because ELK hasn't answered yet, so the viewport ended up zoomed into a
 * single node. Re-fit whenever a finished layout (new positions) lands.
 */
function FitOnLayout({ status, positions }: { status: string; positions: unknown }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (status === "loading") return;
    // React Flow copies the `nodes` prop into its store in its own effect,
    // which runs after this child effect: fitting now would measure the old
    // (0,0) bounds and zoom to maxZoom on one node. Wait one frame.
    const frame = requestAnimationFrame(() => void fitView({ padding: 0.1 }));
    return () => cancelAnimationFrame(frame);
  }, [status, positions, fitView]);
  return null;
}

/** Pans to `focusId` once the layout has positioned it. */
function FocusNode({ focusId, status }: { focusId: string | null | undefined; status: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!focusId || status === "loading") return;
    const frame = requestAnimationFrame(
      () => void fitView({ nodes: [{ id: focusId }], padding: 0.6, maxZoom: 1.1, duration: 300 }),
    );
    return () => cancelAnimationFrame(frame);
  }, [focusId, status, fitView]);
  return null;
}

function Inner({
  nodes,
  edges,
  onSelect,
  onPaneClick,
  focusId,
  roles,
  banners,
  ariaLabel,
  announcement,
  height = 480,
}: GraphCanvasProps) {
  const t = useTranslations("graph");
  const nodeIds = useMemo(() => nodes.map((n) => n.id), [nodes]);
  const { positions, status } = useElkLayout(nodeIds, edges);

  const extent = useMemo(
    () => (status === "loading" ? undefined : layoutExtent(positions, NODE_WIDTH, NODE_HEIGHT)),
    [positions, status],
  );

  const flowNodes = useMemo<Node<GraphNodeData>[]>(
    () =>
      nodes.map((n) => {
        const base = DEFAULT_ROLES[n.role] ?? DEFAULT_ROLES.other!;
        const roleDef: GraphRoleDef = roles?.[n.role] ?? { ...base, label: n.role };
        return {
          id: n.id,
          type: "graph",
          position: positions[n.id] ?? { x: 0, y: 0 },
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          draggable: false,
          connectable: false,
          focusable: false,
          data: { node: n, roleDef, onSelect, customLabel: !!roles?.[n.role] },
        };
      }),
    [nodes, positions, roles, onSelect],
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        focusable: false,
        label: edgeLabel(e, t),
        style: {
          strokeDasharray: e.inferred ? "6 4" : undefined,
          strokeWidth: edgeStrokeWidth(e),
          opacity: e.dimmed ? 0.3 : 1,
        },
      })),
    [edges, t],
  );

  const conditions: BannerCondition[] = [
    ...(banners ?? []),
    ...(status === "skipped" ? [{ id: "layout-skipped", text: t("state.layoutSkipped"), tone: "info" as const }] : []),
  ];
  const statusMessage = status === "loading" ? t("state.layouting") : announcement ?? "";

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <GraphBanner conditions={conditions} />
      <div
        role="region"
        aria-label={ariaLabel}
        aria-busy={status === "loading"}
        style={{ height, border: "1px solid var(--border)", borderRadius: 6 }}
      >
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={NODE_TYPES}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          // React Flow sets `pointer-events: none` on a node wrapper unless the
          // node is selectable/draggable or an `onNodeClick` handler exists —
          // with both disabled above, a click never reached GraphNode. This
          // handler is what makes nodes clickable; keyboard selection stays
          // on GraphNode itself.
          onNodeClick={(_, n) => onSelect?.(n.id)}
          onPaneClick={onPaneClick}
          fitView
          minZoom={0.02}
          translateExtent={extent}
          // Hundreds of nodes: skip off-screen nodes/edges so panning stays smooth.
          onlyRenderVisibleElements={nodes.length > 80}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
          <GraphToolbar nodes={nodes} selectedId={focusId} onSelect={onSelect} />
          {nodes.length > 12 && (
            <MiniMap
              pannable
              zoomable
              ariaLabel={t("toolbar.minimap")}
              nodeColor={(n) => (n.data as GraphNodeData).roleDef.tone ?? "var(--text-muted)"}
              nodeStrokeWidth={0}
              nodeBorderRadius={4}
              maskColor="rgba(0, 0, 0, 0.55)"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", width: 180, height: 120 }}
            />
          )}
          <FitOnLayout status={status} positions={positions} />
          <FocusNode focusId={focusId} status={status} />
        </ReactFlow>
      </div>
      <Legend nodes={nodes} edges={edges} roles={roles} />
      <LiveRegion message={statusMessage} />
    </div>
  );
}

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

