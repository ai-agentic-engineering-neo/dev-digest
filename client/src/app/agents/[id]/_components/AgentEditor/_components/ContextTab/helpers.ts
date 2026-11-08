import { CONTEXT_TOKEN_CAP } from "@/lib/context-docs";
import type { AgentContextDoc, ContextDoc, DocSource } from "@/lib/types";

/** One row of the agent's Context tab. */
export interface ContextRow {
  path: string;
  source: DocSource | null;
  tokens: number | null;
  attached: boolean;
  /** Position among attached docs (prompt order); -1 when not attached. */
  position: number;
  /** "missing" = attached but not found at the last synced commit. */
  status: "ok" | "missing";
  /** Attached-agents count from the repo list (0 for a missing doc). */
  attachedAgents: number;
}

/** Attached docs first in `position` order (including missing ones), then the rest by path. */
export function buildContextRows(docs: readonly ContextDoc[], attached: readonly AgentContextDoc[]): ContextRow[] {
  const listed = new Map(docs.map((d) => [d.path, d]));
  const head = [...attached]
    .sort((a, b) => a.position - b.position)
    .map((a, position): ContextRow => {
      const l = listed.get(a.path);
      return {
        path: a.path,
        source: a.source ?? l?.source ?? null,
        tokens: a.tokens ?? (a.status === "ok" ? (l?.tokens ?? null) : null),
        attached: true,
        position,
        status: a.status,
        attachedAgents: l?.attached_agents ?? 0,
      };
    });
  const attachedSet = new Set(attached.map((a) => a.path));
  const rest = docs
    .filter((d) => !attachedSet.has(d.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(
      (d): ContextRow => ({
        path: d.path,
        source: d.source,
        tokens: d.tokens,
        attached: false,
        position: -1,
        status: "ok",
        attachedAgents: d.attached_agents,
      }),
    );
  return [...head, ...rest];
}

/** Attach → append to the end of the prompt; detach → remove. */
export function toggleAttached(paths: readonly string[], path: string): string[] {
  return paths.includes(path) ? paths.filter((p) => p !== path) : [...paths, path];
}

/** Move the attached doc `path` to `to` (clamped) among attached docs. */
export function moveAttached(paths: readonly string[], path: string, to: number): string[] {
  if (!paths.includes(path)) return [...paths];
  const next = paths.filter((p) => p !== path);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, path);
  return next;
}

/** Attached docs that are over the cap on their own (left out of every run). */
export function tooLargeAttached(rows: readonly ContextRow[]): ContextRow[] {
  return rows.filter((r) => r.attached && r.tokens != null && r.tokens > CONTEXT_TOKEN_CAP);
}
