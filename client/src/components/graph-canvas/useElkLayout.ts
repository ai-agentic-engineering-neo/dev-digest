"use client";

import { useEffect, useMemo, useState } from "react";
import { MAX_LAYOUT_NODES, NODE_HEIGHT, NODE_WIDTH } from "./constants";
import { gridLayout } from "./helpers";
import type { LayoutStatus, Position } from "./types";

interface LayoutEdge {
  id: string;
  source: string;
  target: string;
}

export interface ElkLayoutResult {
  positions: Record<string, Position>;
  status: LayoutStatus;
}

/**
 * Lazy ELK layered layout. `elkjs` is dynamically imported (main thread, bundled build)
 * only when the graph has <= MAX_LAYOUT_NODES nodes; larger graphs get a deterministic grid
 * and status "skipped". Inputs are sorted by id so identical graphs lay out identically.
 */
export function useElkLayout(nodeIds: string[], edges: LayoutEdge[]): ElkLayoutResult {
  const key = useMemo(() => {
    const ids = [...nodeIds].sort();
    const es = edges.map((e) => `${e.id}|${e.source}|${e.target}`).sort();
    return JSON.stringify([ids, es]);
  }, [nodeIds, edges]);

  const [state, setState] = useState<{ key: string; result: ElkLayoutResult } | null>(null);

  useEffect(() => {
    const [ids, es] = JSON.parse(key) as [string[], string[]];
    if (ids.length === 0) {
      setState({ key, result: { positions: {}, status: "ready" } });
      return;
    }
    if (ids.length > MAX_LAYOUT_NODES) {
      setState({ key, result: { positions: gridLayout(ids), status: "skipped" } });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("elkjs/lib/elk.bundled.js");
        const ELK = mod.default;
        const elk = new ELK();
        const known = new Set(ids);
        const graph = await elk.layout({
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": "RIGHT",
            "elk.randomSeed": "1",
            "elk.spacing.nodeNode": "28",
            "elk.layered.spacing.nodeNodeBetweenLayers": "70",
          },
          children: ids.map((id) => ({ id, width: NODE_WIDTH, height: NODE_HEIGHT })),
          edges: es
            .map((s) => s.split("|") as [string, string, string])
            .filter(([, s, t]) => known.has(s) && known.has(t))
            .map(([id, s, t]) => ({ id, sources: [s], targets: [t] })),
        });
        if (cancelled) return;
        const positions: Record<string, Position> = {};
        for (const c of graph.children ?? []) positions[c.id] = { x: c.x ?? 0, y: c.y ?? 0 };
        setState({ key, result: { positions, status: "ready" } });
      } catch {
        if (!cancelled) setState({ key, result: { positions: gridLayout(ids), status: "error" } });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  // Stale result (key changed, new layout pending) is reported as loading.
  if (!state || state.key !== key) return { positions: state?.result.positions ?? {}, status: "loading" };
  return state.result;
}
