import type { AttachedDocument, ProjectDocument } from "@devdigest/shared";

/** Which i18n message file + entity vocabulary a Context tab instance speaks
 *  for — `context.*` keys live in both `messages/en/agents.json` and
 *  `messages/en/skills.json` (same key set, entity-specific wording; see
 *  `ContextTab`'s doc comment). The only thing that differs between the
 *  agent editor's and the skill editor's Context tab. */
export type ContextTabNamespace = "agents" | "skills";

/**
 * One row of a Context tab: a document from the active repo's discovery
 * catalog, cross-referenced with the entity's (agent's or skill's) attachment
 * record, if any. Entity-agnostic — this and every function below operate
 * purely on `DocumentRowModel`/`ProjectDocument`/`AttachedDocument`, never on
 * `Agent`/`Skill` directly, which is why this file is shared between the
 * agent editor's and the skill editor's Context tab
 * (`src/components/context-tab/`) rather than duplicated per entity.
 *
 * Unlike the Skills tab (whose catalog IS the workspace's full skill list),
 * the discovery catalog can drift from the attachment records — a file can be
 * deleted/renamed after it was attached. A row therefore exists for the UNION
 * of "currently discovered" and "currently attached" paths, so a since-deleted
 * attachment still renders (AC-26) instead of silently vanishing.
 */
export interface DocumentRowModel {
  path: string;
  /** Null when the path is attached but no longer in the discovery catalog
   *  (deleted/renamed/moved out of the search roots). */
  docType: string | null;
  /** The real per-run tokenizer count — from the attachment record when
   *  attached (server-computed, reflects `missing` as 0), else the catalog's
   *  discovery-time count (AC-6). */
  tokens: number;
  attached: boolean;
  /** AC-26 — the attachment is retained but its file no longer resolves. */
  missing: boolean;
}

/**
 * Build every row: attached documents first (attachment `order` ascending, or
 * `pendingOrder` while a drag is in flight — mirrors SkillsTab's `buildRows`),
 * then never-attached catalog documents in discovery (alphabetical) order.
 */
export function buildRows(
  catalog: ProjectDocument[],
  attachments: AttachedDocument[],
  pendingOrder?: string[] | null,
): DocumentRowModel[] {
  const catalogByPath = new Map(catalog.map((d) => [d.path, d]));
  const attachedByPath = new Map(attachments.map((a) => [a.path, a]));

  const paths = new Set<string>([...catalogByPath.keys(), ...attachedByPath.keys()]);

  const rows: DocumentRowModel[] = [...paths].map((path) => {
    const doc = catalogByPath.get(path);
    const att = attachedByPath.get(path);
    return {
      path,
      docType: doc?.doc_type ?? null,
      tokens: att ? att.tokens : (doc?.tokens ?? 0),
      attached: att?.attached === true,
      missing: att?.status === "missing",
    };
  });

  const rank = new Map<string, number>();
  if (pendingOrder && pendingOrder.length > 0) {
    pendingOrder.forEach((p, i) => rank.set(p, i));
  } else {
    [...attachments]
      .filter((a) => a.attached)
      .sort((a, b) => a.order - b.order)
      .forEach((a, i) => rank.set(a.path, i));
  }

  // Un-ranked rows (never attached, or attached but off) keep catalogue
  // order behind every ranked one.
  return rows
    .map((row, i) => ({ row, key: rank.get(row.path) ?? rank.size + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.row);
}

function reorder(paths: string[], from: number, to: number): string[] {
  if (from < 0 || to < 0 || from >= paths.length || to >= paths.length || from === to) return paths;
  const next = [...paths];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Row paths after dropping `fromPath` onto `toPath`'s slot. */
export function moveOnto(rows: DocumentRowModel[], fromPath: string, toPath: string): string[] {
  const paths = rows.map((r) => r.path);
  return reorder(paths, paths.indexOf(fromPath), paths.indexOf(toPath));
}

/** Row paths after nudging `path` by `delta` slots (keyboard reordering). */
export function moveBy(rows: DocumentRowModel[], path: string, delta: number): string[] {
  const paths = rows.map((r) => r.path);
  const from = paths.indexOf(path);
  return reorder(paths, from, from + delta);
}

/**
 * The paths `POST /agents/:id/documents` (or the skill equivalent) may be
 * given: it REPLACES the whole attached set, so an unattached row in the
 * payload would be silently attached. Reordering must move attached rows only.
 */
export function attachedPathsInOrder(rows: DocumentRowModel[], order: string[]): string[] {
  const attached = new Set(rows.filter((r) => r.attached).map((r) => r.path));
  return order.filter((p) => attached.has(p));
}

/** Path substring match for the filter input (AC-23) — never changes
 *  attachment or ordering state. */
export function matchesFilter(path: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return path.toLowerCase().includes(needle);
}

/** AC-7 — summed token count of the ATTACHED set, over every attached row
 *  regardless of the filter (detaching/attaching is what should move this
 *  number, not narrowing the visible list). */
export function attachedTokenTotal(rows: DocumentRowModel[]): number {
  return rows.filter((r) => r.attached).reduce((sum, r) => sum + r.tokens, 0);
}

/** 1-based position of `path` among ATTACHED rows only — order is drop
 *  priority (AC-21), so this is what the reorder control announces. */
export function attachedPosition(rows: DocumentRowModel[], path: string): { index: number; total: number } {
  const attachedRows = rows.filter((r) => r.attached);
  return { index: attachedRows.findIndex((r) => r.path === path) + 1, total: attachedRows.length };
}
