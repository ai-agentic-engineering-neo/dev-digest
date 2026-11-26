"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useAgentSkills, useSetAgentSkills } from "@/lib/hooks/agents";
import { useSkills } from "@/lib/hooks/skills";
import { attachedIdsOf, filterRows, move, orderRows, toggle, type SkillRowModel } from "./helpers";

/** A row to focus once it renders at `position` (keeps focus through a keyboard move). */
interface PendingFocus {
  id: string;
  position: number;
}

/**
 * State + actions for the agent Skills tab. Every attach/detach/reorder saves
 * immediately through `useSetAgentSkills` (optimistic, rolls back on error; the
 * global MutationCache in `lib/providers.tsx` raises the error toast).
 */
export function useSkillsTab(agentId: string) {
  const t = useTranslations("agents");
  const skillsQuery = useSkills();
  const linksQuery = useAgentSkills(agentId);
  const setSkills = useSetAgentSkills(agentId);

  const [query, setQuery] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const pendingFocus = React.useRef<PendingFocus | null>(null);

  const rows = orderRows(skillsQuery.data ?? [], linksQuery.data ?? []);
  const attachedIds = attachedIdsOf(rows);
  const visibleRows = filterRows(rows, query);
  // Reordering a filtered list would move rows past hidden neighbours.
  const canReorder = query.trim() === "";

  const save = (ids: string[]) => setSkills.mutate(ids);

  const handleToggle = (id: string) => save(toggle(attachedIds, id));

  const reorder = (id: string, to: number) => {
    const from = attachedIds.indexOf(id);
    if (!canReorder || from < 0 || to < 0 || to >= attachedIds.length || from === to) return;
    save(move(attachedIds, from, to));
    const row = rows[from]!;
    pendingFocus.current = { id, position: to };
    setAnnouncement(
      t("skills.moved", { name: row.skill.name, position: to + 1, total: attachedIds.length }),
    );
  };

  const handleMove = (row: SkillRowModel, delta: -1 | 1) => {
    if (row.position !== null) reorder(row.skill.id, row.position + delta);
  };

  const handleDrop = (target: SkillRowModel) => {
    if (dragId && target.position !== null) reorder(dragId, target.position);
    setDragId(null);
  };

  /** Callback ref: re-focus a moved row once it renders at its new position. */
  const focusRowRef = (row: SkillRowModel) => (el: HTMLElement | null) => {
    const pending = pendingFocus.current;
    if (!el || !pending || pending.id !== row.skill.id || pending.position !== row.position) return;
    pendingFocus.current = null;
    if (document.activeElement !== el && !el.contains(document.activeElement)) el.focus();
  };

  return {
    isLoading: skillsQuery.isLoading || linksQuery.isLoading,
    isError: skillsQuery.isError || linksQuery.isError,
    retry: () => {
      void skillsQuery.refetch();
      void linksQuery.refetch();
    },
    total: rows.length,
    attachedCount: attachedIds.length,
    visibleRows,
    query,
    setQuery,
    canReorder,
    dragId,
    setDragId,
    announcement,
    handleToggle,
    handleMove,
    handleDrop,
    focusRowRef,
  };
}
