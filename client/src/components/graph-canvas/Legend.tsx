"use client";

import { useTranslations } from "next-intl";
import { DEFAULT_ROLES } from "./constants";
import { shapeStyle } from "./helpers";
import type { GraphEdgeInput, GraphNodeInput, GraphRoleDef } from "./types";

/** Lists every encoding actually used by the current graph (shape+icon+text, stroke styles, tags). */
export function Legend({
  nodes,
  edges,
  roles: customRoles,
}: {
  nodes: GraphNodeInput[];
  edges: GraphEdgeInput[];
  roles?: Record<string, GraphRoleDef>;
}) {
  const t = useTranslations("graph");
  const roles = [...new Set(nodes.map((n) => n.role))].sort();
  const hasDeleted = nodes.some((n) => n.deleted);
  const hasInferred = edges.some((e) => e.inferred);
  const hasTypeOnly = edges.some((e) => e.typeOnly);
  const hasWeight = edges.some((e) => (e.weight ?? 0) > 1);
  if (!roles.length && !hasInferred && !hasTypeOnly && !hasWeight) return null;
  return (
    <section aria-label={t("legend.title")} style={{ fontSize: 12, color: "var(--text-secondary)" }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 12 }}>{t("legend.title")}</h3>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 12 }}>
        {roles.map((role) => {
          const def = customRoles?.[role] ?? DEFAULT_ROLES[role] ?? DEFAULT_ROLES.other!;
          const Icon = def.icon;
          return (
            <li key={role} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span
                aria-hidden
                style={{
                  width: 22,
                  height: 16,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid var(--border-strong)",
                  background: "var(--bg-surface)",
                  ...shapeStyle(def.shape),
                }}
              >
                <Icon size={10} style={{ color: def.tone }} />
              </span>
              {customRoles?.[role]?.label ?? (t.has(`role.${role}`) ? t(`role.${role}`) : role)}
            </li>
          );
        })}
        {hasInferred && (
          <li style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <svg width="26" height="6" aria-hidden>
              <line x1="0" y1="3" x2="26" y2="3" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            {t("legend.inferred")}
          </li>
        )}
        {hasTypeOnly && (
          <li style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <svg width="26" height="6" aria-hidden>
              <line x1="0" y1="3" x2="26" y2="3" stroke="currentColor" strokeWidth="1" />
            </svg>
            {t("legend.typeOnly")}
          </li>
        )}
        {hasWeight && (
          <li style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <svg width="26" height="6" aria-hidden>
              <line x1="0" y1="3" x2="26" y2="3" stroke="currentColor" strokeWidth="4" />
            </svg>
            <strong>{t("legend.weightSample")}</strong> {t("legend.weight")}
          </li>
        )}
        {hasDeleted && (
          <li>
            <s>{t("legend.deletedSample")}</s> {t("legend.deleted")}
          </li>
        )}
      </ul>
    </section>
  );
}
