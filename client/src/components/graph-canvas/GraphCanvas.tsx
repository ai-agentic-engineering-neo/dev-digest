"use client";

import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { Background, Controls, ReactFlow, ReactFlowProvider, type Edge, type Node } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { DEFAULT_ROLES, NODE_HEIGHT, NODE_WIDTH } from "./constants";
import { GraphBanner } from "./GraphBanner";
import { GraphNode } from "./GraphNode";
import { Legend } from "./Legend";
import { LiveRegion } from "./LiveRegion";
import { edgeLabel, edgeStrokeWidth } from "./helpers";
import { useElkLayout } from "./useElkLayout";
import type { BannerCondition, GraphEdgeInput, GraphNodeData, GraphNodeInput, GraphRoleDef } from "./types";

export interface GraphCanvasProps {
  nodes: GraphNodeInput[];
  edges: GraphEdgeInput[];
  /** Called on click / Enter / Space on a node. */
  onSelect?: (id: string) => void;
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

function Inner({ nodes, edges, onSelect, roles, banners, ariaLabel, announcement, height = 480 }: GraphCanvasProps) {
  const t = useTranslations("graph");
  const nodeIds = useMemo(() => nodes.map((n) => n.id), [nodes]);
  const { positions, status } = useElkLayout(nodeIds, edges);

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
          fitView
          minZoom={0.1}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
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

