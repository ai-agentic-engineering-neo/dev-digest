/* SkillsTab — which skills this agent uses, in which order. Linked skills come
   first in link order (a dnd-kit sortable list: pointer, touch, and keyboard —
   Space to lift, arrows to move, Space to drop); the rest follow by name. Every
   check, uncheck or drop sends ONE POST /agents/:id/skills { skill_ids }
   (optimistic, rolled back on error). Filtering turns dragging off. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkillLinks, useSetAgentSkills, useSkills } from "@/lib/hooks";
import { SkillRow, SortableSkillRow } from "./_components/SkillRow";
import { matchesFilter, moveLink, splitSkills, toggleLink } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const skills = useSkills();
  const links = useAgentSkillLinks(agent.id);
  const setSkills = useSetAgentSkills(agent.id);
  const [filter, setFilter] = React.useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (skills.isLoading || links.isLoading) return <Skeleton height={200} />;
  if (skills.isError || links.isError || !skills.data || !links.data) {
    return (
      <ErrorState
        title={t("skills.loadError")}
        onRetry={() => {
          skills.refetch();
          links.refetch();
        }}
      />
    );
  }

  const { linked, unlinked } = splitSkills(skills.data, links.data);
  const linkedIds = linked.map((sk) => sk.id);
  const filtering = filter.trim().length > 0;
  const shownLinked = linked.filter((sk) => matchesFilter(sk, filter));
  const shownUnlinked = unlinked.filter((sk) => matchesFilter(sk, filter));

  const onCheck = (id: string, on: boolean) => setSkills.mutate(toggleLink(linkedIds, id, on));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const next = moveLink(linkedIds, String(active.id), over ? String(over.id) : null);
    if (next) setSkills.mutate(next);
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>
          {t("skills.title")} · <strong>{t("skills.enabledCount", { linked: linked.length, total: skills.data.length })}</strong>
        </h2>
        <Link href="/skills" style={s.manage}>
          {t("skills.manage")}
        </Link>
      </div>
      <div style={s.filter}>
        <Icon.Filter size={13} style={s.filterIcon} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("skills.filterPlaceholder")}
          aria-label={t("skills.filterPlaceholder")}
          style={s.filterInput}
        />
      </div>
      <p style={s.caption}>{filtering ? t("skills.filterDisablesDrag") : t("skills.orderHint")}</p>

      {skills.data.length === 0 && <p style={s.caption}>{t("skills.empty")}</p>}
      {skills.data.length > 0 && shownLinked.length + shownUnlinked.length === 0 && (
        <p style={s.caption}>{t("skills.noMatch")}</p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={linkedIds} strategy={verticalListSortingStrategy} disabled={filtering}>
          <ul style={s.list} aria-label={t("skills.title")}>
            {/* Only ENABLED skills can be reordered: a disabled one contributes
                nothing to the prompt, so its position is meaningless. */}
            {shownLinked.map((sk) => (
              <SortableSkillRow
                key={sk.id}
                skill={sk}
                checked
                disabled={filtering || !sk.enabled}
                onCheck={(on) => onCheck(sk.id, on)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <ul style={s.list}>
        {shownUnlinked.map((sk) => (
          <SkillRow key={sk.id} skill={sk} checked={false} onCheck={(on) => onCheck(sk.id, on)} />
        ))}
      </ul>
    </div>
  );
}
