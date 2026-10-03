"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Checkbox, ErrorState, Icon, Skeleton, TextInput } from "@devdigest/ui";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { SKILL_TYPE_COLOR } from "./constants";
import { checkedOrder, computeInitialChecked, computeInitialOrder, reorderVisible } from "./helpers";
import { s } from "./styles";

/** Skills tab — every workspace skill, merged with this agent's linked order.
    Checking a row links it (appended at the end); dragging reorders the
    displayed list. Both immediately POST the full checked-and-ordered
    skill_ids list via useSetAgentSkills — there's no separate link/unlink/
    reorder endpoint. */
export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: skills, isLoading: skillsLoading, isError: skillsError, refetch: refetchSkills } = useSkills();
  const {
    data: links,
    isLoading: linksLoading,
    isError: linksError,
    refetch: refetchLinks,
  } = useAgentSkills(agent.id);

  if (skillsLoading || linksLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={200} />
        <Skeleton height={320} />
      </div>
    );
  }

  if (skillsError || linksError || !skills) {
    return (
      <ErrorState
        body={t("skills.loadError")}
        onRetry={() => {
          refetchSkills();
          refetchLinks();
        }}
      />
    );
  }

  return <SkillsList agentId={agent.id} skills={skills} links={links ?? []} />;
}

function SkillsList({ agentId, skills, links }: { agentId: string; skills: Skill[]; links: AgentSkillLink[] }) {
  const t = useTranslations("agents");
  const setAgentSkills = useSetAgentSkills();
  const skillById = React.useMemo(() => new Map(skills.map((sk) => [sk.id, sk] as const)), [skills]);

  // Local order/checked state, seeded once from the loaded data — SkillsTab is
  // remounted (`key={agent.id}`) on agent switch, so this never needs to
  // re-sync via an effect, same as ConfigTab's local form state.
  const [rows, setRows] = React.useState<string[]>(() => computeInitialOrder(skills, links));
  const [checked, setChecked] = React.useState<Set<string>>(() => computeInitialChecked(links));
  const [query, setQuery] = React.useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const visible = normalizedQuery
    ? rows.filter((id) => skillById.get(id)?.name.toLowerCase().includes(normalizedQuery))
    : rows;

  const save = (nextRows: string[], nextChecked: Set<string>) => {
    setAgentSkills.mutate({ agentId, skillIds: checkedOrder(nextRows, nextChecked) });
  };

  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
    save(rows, next);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const next = reorderVisible(rows, visible, String(active.id), String(over.id));
    setRows(next);
    save(next, checked);
  };

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("skills.title")}</h2>
      <p style={s.hint}>{t("skills.orderHint")}</p>
      <div style={s.filterRow}>
        <TextInput value={query} onChange={setQuery} placeholder={t("skills.filterPlaceholder")} />
      </div>
      <div style={s.countNote}>{t("skills.enabledCount", { linked: checked.size, total: skills.length })}</div>
      {visible.length === 0 ? (
        <div style={s.empty}>{t("skills.noResults")}</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible} strategy={verticalListSortingStrategy}>
            <div style={s.list}>
              {visible.map((id) => {
                const skill = skillById.get(id);
                if (!skill) return null;
                return <SkillRow key={id} skill={skill} checked={checked.has(id)} onToggle={() => toggle(id)} />;
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SkillRow({ skill, checked, onToggle }: { skill: Skill; checked: boolean; onToggle: () => void }) {
  const t = useTranslations("agents");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: skill.id });
  const style: React.CSSProperties = {
    ...s.row,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <button type="button" aria-label="Drag to reorder" style={s.dragHandle} {...attributes} {...listeners}>
        <Icon.Menu size={14} />
      </button>
      <Checkbox checked={checked} onChange={onToggle} />
      <span style={s.name}>{skill.name}</span>
      <Badge color={SKILL_TYPE_COLOR[skill.type]} bg="transparent">
        {skill.type}
      </Badge>
      {skill.source !== "manual" && <Badge color="var(--text-muted)">{t("skills.imported")}</Badge>}
    </div>
  );
}
