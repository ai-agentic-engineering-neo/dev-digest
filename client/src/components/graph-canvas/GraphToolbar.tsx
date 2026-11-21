"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Panel, useReactFlow } from "@xyflow/react";
import { Crosshair, Maximize, Pencil, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { searchNodes } from "./helpers";
import type { GraphNodeInput } from "./types";

/** Max search hits listed under the box. */
const MAX_HITS = 8;
const FOCUS = { padding: 0.6, maxZoom: 1.1, duration: 300 } as const;

/**
 * Overlay (top-right) that keeps a big graph navigable: find a node by name or
 * path, fit the whole graph, zoom to the changed code, re-center the current
 * selection. Rendered inside `<ReactFlow>` so it can drive the viewport.
 */
export function GraphToolbar({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: GraphNodeInput[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const t = useTranslations("graph.toolbar");
  const { fitView } = useReactFlow();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const hits = useMemo(() => searchNodes(nodes, query).slice(0, MAX_HITS), [nodes, query]);
  const changedIds = useMemo(() => nodes.filter((n) => n.role === "changed").map((n) => ({ id: n.id })), [nodes]);

  const pick = (id: string) => {
    onSelect?.(id);
    void fitView({ nodes: [{ id }], ...FOCUS });
    setQuery("");
    setActive(0);
  };

  return (
    <Panel position="top-right" style={st.panel}>
      <div style={st.searchWrap}>
        <label style={st.search}>
          <Search size={13} aria-hidden style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            type="search"
            role="combobox"
            aria-expanded={query.trim().length > 0}
            aria-controls="graph-search-results"
            aria-label={t("search")}
            placeholder={t("search")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, hits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && hits[active]) {
                e.preventDefault();
                pick(hits[active]!.id);
              } else if (e.key === "Escape") {
                // Keep Esc local: clearing the search must not also clear the selection.
                e.stopPropagation();
                setQuery("");
              }
            }}
            style={st.input}
          />
        </label>
        {query.trim() && (
          <ul id="graph-search-results" role="listbox" aria-label={t("results")} style={st.results}>
            {hits.length === 0 ? (
              <li style={st.empty}>{t("noResults")}</li>
            ) : (
              hits.map((n, i) => (
                <li key={n.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    style={{ ...st.hit, background: i === active ? "var(--bg-hover)" : "transparent" }}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(n.id)}
                  >
                    <span style={st.hitLabel}>{n.label}</span>
                    {n.secondary && <span style={st.hitSub}>{n.secondary}</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      <div style={st.buttons}>
        <button
          type="button"
          style={st.btn}
          title={t("fitAll")}
          aria-label={t("fitAll")}
          onClick={() => void fitView({ padding: 0.1, duration: 300 })}
        >
          <Maximize size={14} aria-hidden />
        </button>
        {changedIds.length > 0 && (
          <button
            type="button"
            style={st.btn}
            title={t("fitChanged")}
            aria-label={t("fitChanged")}
            onClick={() => void fitView({ nodes: changedIds, padding: 0.2, maxZoom: 1.1, duration: 300 })}
          >
            <Pencil size={14} aria-hidden />
          </button>
        )}
        <button
          type="button"
          style={st.btn}
          title={t("focusSelected")}
          aria-label={t("focusSelected")}
          disabled={!selectedId}
          onClick={() => selectedId && void fitView({ nodes: [{ id: selectedId }], ...FOCUS })}
        >
          <Crosshair size={14} aria-hidden />
        </button>
      </div>
    </Panel>
  );
}

const st = {
  panel: { display: "flex", gap: 6, alignItems: "flex-start", margin: 10 } satisfies CSSProperties,
  searchWrap: { position: "relative", width: 240 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 9px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    boxShadow: "0 4px 14px rgba(0,0,0,.25)",
  } satisfies CSSProperties,
  input: {
    flex: 1,
    minWidth: 0,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: 12.5,
  } satisfies CSSProperties,
  results: {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    margin: 0,
    padding: 4,
    listStyle: "none",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    boxShadow: "0 8px 24px rgba(0,0,0,.35)",
    maxHeight: 300,
    overflowY: "auto",
    zIndex: 10,
  } satisfies CSSProperties,
  empty: { padding: "6px 8px", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  hit: {
    width: "100%",
    display: "grid",
    gap: 1,
    padding: "6px 8px",
    borderRadius: 5,
    border: "none",
    textAlign: "left",
    cursor: "pointer",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  hitLabel: { fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  hitSub: {
    fontSize: 11,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  buttons: {
    display: "flex",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    overflow: "hidden",
    boxShadow: "0 4px 14px rgba(0,0,0,.25)",
  } satisfies CSSProperties,
  btn: {
    width: 32,
    height: 30,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
  } satisfies CSSProperties,
} as const;
