"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { NODE_HEIGHT, NODE_WIDTH } from "./constants";
import { shapeStyle } from "./helpers";
import type { GraphNodeData } from "./types";

type FlowNode = Node<GraphNodeData, "graph">;

/** Custom node: keyboard-focusable button; label/secondary rendered as plain text.
 *  Mouse clicks are handled by `<ReactFlow onNodeClick>` in GraphCanvas (it is
 *  also what enables pointer events on the node wrapper) — a second onClick
 *  here would fire `onSelect` twice. */
export function GraphNode({ data }: NodeProps<FlowNode>) {
  const t = useTranslations("graph");
  const { node, roleDef, onSelect } = data;
  const Icon = roleDef.icon;
  const roleLabel = t.has(`role.${node.role}`) && !data.customLabel ? t(`role.${node.role}`) : roleDef.label;
  const tags = [...(node.tags ?? []), ...(node.deleted ? [t("tag.deleted")] : [])];
  const select = () => onSelect?.(node.id);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={!!node.selected}
      aria-label={`${roleLabel}: ${node.label}${node.deleted ? ` (${t("tag.deleted")})` : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select();
        }
      }}
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        boxSizing: "border-box",
        padding: "6px 14px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 2,
        cursor: "pointer",
        background: node.highlighted ? "var(--accent-bg)" : "var(--bg-surface)",
        border: `${node.selected ? 2 : 1}px solid ${node.selected ? "var(--accent)" : "var(--border-strong)"}`,
        // Role strip as an inset shadow — a `borderLeft` next to the `border`
        // shorthand makes React warn about conflicting style properties.
        boxShadow:
          [
            roleDef.tone && roleDef.shape === "rect" ? `inset 3px 0 0 ${roleDef.tone}` : null,
            node.selected ? "0 0 0 4px var(--accent-bg)" : null,
          ]
            .filter(Boolean)
            .join(", ") || undefined,
        opacity: node.dimmed ? 0.4 : 1,
        fontSize: 12,
        color: "var(--text-primary)",
        ...shapeStyle(roleDef.shape),
      }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} style={{ opacity: 0 }} />
      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <Icon size={12} aria-hidden style={{ flex: "none", color: roleDef.tone }} />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textDecoration: node.deleted ? "line-through" : undefined,
            fontWeight: 600,
          }}
        >
          {node.label}
        </span>
      </span>
      <span style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", gap: 6, minWidth: 0 }}>
        <span>{roleLabel}</span>
        {tags.map((tag) => (
          <span key={tag} style={{ border: "1px solid var(--border)", borderRadius: 3, padding: "0 3px" }}>
            {tag}
          </span>
        ))}
        {node.secondary && (
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {node.secondary}
          </span>
        )}
      </span>
      <Handle type="source" position={Position.Right} isConnectable={false} style={{ opacity: 0 }} />
    </div>
  );
}
