"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { TextInput } from "@devdigest/ui";
import type { AttachedDocument } from "@devdigest/shared";
import { useRepoDocuments } from "@/lib/hooks/project-context";
import {
  attachedPathsInOrder,
  attachedPosition,
  attachedTokenTotal,
  buildRows,
  matchesFilter,
  moveBy,
  moveOnto,
  type ContextTabNamespace,
} from "../helpers";
import { DocumentRow } from "../DocumentRow";
import { s } from "../styles";

export type { ContextTabNamespace };

/**
 * specs/09-project-context-folder.md — Context tab, shared between the agent
 * editor and the skill editor (US-2/US-3, AC-7 through AC-13, AC-23,
 * AC-26/AC-37). Copies SkillsTab's proven shape: checkbox = attach/detach via
 * PUT (never unlinks, so `order` survives an off/on cycle — AC-10), drag/
 * keyboard = the whole ordered attached set via POST (AC-9), filter box
 * narrows the VISIBLE rows only (AC-23), and the enabled/attached count is
 * computed over those visible rows.
 *
 * Two things SkillsTab doesn't need: a running token total over the WHOLE
 * attached set regardless of the filter (AC-7 — detaching moves this number,
 * narrowing the list must not), and a `missing` badge for an attachment whose
 * file no longer resolves (AC-26).
 *
 * For a skill, every agent with that skill enabled inherits its attached
 * documents, merged into the SAME `## Project context` block the agent's own
 * attachments render into (D1) — there is no separate "skill specs" section.
 *
 * The agent editor and the skill editor are two different features (they
 * never import each other — `frontend-ui-architecture`'s feature-boundary
 * rule) attaching documents to two different entities through two different
 * endpoints, but everything below this line — row building, filtering,
 * reorder math, the token total, the accessibility announcements — is
 * entity-agnostic. Only the data-fetching (`useEntityDocuments("agent" |
 * "skill", id)`, `src/lib/hooks/project-context.ts`) and the i18n namespace
 * differ, so those are the only things each editor's thin wrapper
 * (`AgentEditor/_components/ContextTab`, `SkillEditor/_components/ContextTab`)
 * supplies — as props, not as a second copy of this file.
 */
export interface ContextTabProps {
  /** Which i18n namespace this tab renders `context.*` strings from —
   *  `"agents"` or `"skills"`; see `ContextTabNamespace`. */
  namespace: ContextTabNamespace;
  /** Null when the workspace has no active repo — renders the "no active
   *  repo" empty state instead of the list. */
  repoId: string | null;
  /** The entity's (agent's or skill's) attached documents, from
   *  `useEntityDocuments("agent" | "skill", id)`. */
  attachments: AttachedDocument[] | undefined;
  /** Attach/detach ONE document without touching its position (AC-8, AC-10).
   *  The wrapper resolves this to `PUT /agents/:id/documents` or the skill
   *  equivalent, carrying whichever id field the entity's endpoint expects. */
  onToggle: (path: string, attached: boolean) => void;
  /** Persist the whole reordered attached set (AC-9). The wrapper resolves
   *  this to `POST /agents/:id/documents` or the skill equivalent;
   *  `onSettled` clears this component's optimistic `pendingOrder` once the
   *  mutation lands either way. */
  onReorder: (documents: { repo_id: string; path: string }[], opts: { onSettled: () => void }) => void;
}

export function ContextTab({ namespace, repoId, attachments, onToggle, onReorder }: ContextTabProps) {
  const t = useTranslations(namespace);

  const { data: catalog } = useRepoDocuments(repoId);

  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = React.useState<string[] | null>(null);
  // Screen-reader-only status line — announces the reordered document's new
  // position (order is drop priority, AC-21, so a keyboard user needs more
  // than "it moved").
  const [announcement, setAnnouncement] = React.useState("");

  const rows = React.useMemo(
    () => buildRows(catalog?.documents ?? [], attachments ?? [], pendingOrder),
    [catalog, attachments, pendingOrder],
  );
  const visible = rows.filter((r) => matchesFilter(r.path, filter));
  // Counted over the VISIBLE rows so the header and the list can never
  // disagree — same rule the Skills tab and the findings filter chips follow.
  const attachedVisibleCount = visible.filter((r) => r.attached).length;
  // AC-7 — the running total is over the WHOLE attached set; narrowing the
  // filter must not change the number the user is budgeting against.
  const tokenTotal = attachedTokenTotal(rows);

  const toggle = (path: string, next: boolean) => {
    onToggle(path, next);
    // Accessibility — attaching/detaching moves both the attached-count and
    // the token-total the header displays, so both must be announced too
    // (specs/09-project-context-folder.md Non-functional > Accessibility).
    // Computed against the same row/filter logic the header uses, applying
    // this toggle locally rather than waiting on the mutation to settle.
    const nextRows = rows.map((r) => (r.path === path ? { ...r, attached: next } : r));
    const nextVisible = nextRows.filter((r) => matchesFilter(r.path, filter));
    const nextAttachedCount = nextVisible.filter((r) => r.attached).length;
    const nextTokenTotal = attachedTokenTotal(nextRows);
    setAnnouncement(
      t(next ? "context.attachAnnounce" : "context.detachAnnounce", {
        path,
        attached: nextAttachedCount,
        total: nextVisible.length,
        tokens: nextTokenTotal,
      }),
    );
  };

  const applyOrder = (order: string[]) => {
    if (!repoId) return;
    setPendingOrder(order);
    const attachedOrder = attachedPathsInOrder(rows, order);
    onReorder(
      attachedOrder.map((path) => ({ repo_id: repoId, path })),
      { onSettled: () => setPendingOrder(null) },
    );
  };

  const move = (path: string, delta: number) => {
    const order = moveBy(rows, path, delta);
    applyOrder(order);
    // Only an ATTACHED row's move is meaningful to announce — order among
    // never-attached rows carries no priority (it isn't persisted anywhere).
    const row = rows.find((r) => r.path === path);
    if (!row?.attached) return;
    const { index, total } = attachedPosition(rows, path);
    const newIndex = Math.min(Math.max(index + delta, 1), total);
    setAnnouncement(t("context.reorderAnnounce", { path, position: newIndex, total }));
  };

  if (!repoId) {
    return (
      <div style={s.wrap}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        <p style={s.hint}>{t("context.noRepo")}</p>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        <div style={s.headerRight}>
          <span className="tnum" style={s.tokenTotal}>
            {t("context.tokenTotal", { count: tokenTotal })}
          </span>
          <span style={s.count}>
            {t("context.attachedCount", { attached: attachedVisibleCount, total: visible.length })}
          </span>
        </div>
      </div>
      <p style={s.hint}>{t("context.orderHint")}</p>
      <div style={s.filter}>
        <TextInput value={filter} onChange={setFilter} placeholder={t("context.filterPlaceholder")} />
      </div>
      <div role="status" aria-live="polite" style={s.srOnly}>
        {announcement}
      </div>
      {visible.length === 0 ? (
        <p style={s.empty}>{t("context.empty")}</p>
      ) : (
        <div style={s.list}>
          {visible.map((row) => {
            const { index, total } = attachedPosition(rows, row.path);
            return (
              <DocumentRow
                key={row.path}
                namespace={namespace}
                row={row}
                onToggle={(next) => toggle(row.path, next)}
                drag={{
                  active: dragId === row.path,
                  position: index,
                  total,
                  onStart: () => setDragId(row.path),
                  onEnd: () => setDragId(null),
                  onDrop: () => {
                    if (dragId && dragId !== row.path) applyOrder(moveOnto(rows, dragId, row.path));
                    setDragId(null);
                  },
                  onMove: (delta) => move(row.path, delta),
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
