/* SkillsTab — attach/detach + reorder the skills appended into this agent's
   review prompt. One merged, drag-reorderable list of every workspace skill:
   checked rows are linked to this agent, unchecked rows are not. The
   persisted order is the relative order of the CHECKED rows within this
   single list (not two separate "enabled"/"available" lists). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, ErrorState, Icon, Skeleton, TextInput } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { SKILL_TYPE_COLOR } from "./constants";
import { filterSkillsByName, mergeSkillOrder, reorder } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: skills, isLoading: skillsLoading, isError: skillsError, refetch: refetchSkills } = useSkills();
  const { data: links, isLoading: linksLoading, isError: linksError, refetch: refetchLinks } = useAgentSkills(
    agent.id,
  );
  const setSkills = useSetAgentSkills(agent.id);

  const [order, setOrder] = React.useState<string[] | null>(null);
  const [checked, setChecked] = React.useState<Set<string> | null>(null);
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [dragOverId, setDragOverId] = React.useState<string | null>(null);

  // Local list state resets whenever we switch to a different agent.
  React.useEffect(() => {
    setOrder(null);
    setChecked(null);
  }, [agent.id]);

  // Seed local order + checked state once both queries have loaded.
  React.useEffect(() => {
    if (order !== null || !skills || !links) return;
    setOrder(mergeSkillOrder(skills, links));
    setChecked(new Set(links.map((l) => l.skill_id)));
  }, [skills, links, order]);

  const commit = (nextOrder: string[], nextChecked: Set<string>) => {
    setSkills.mutate({ skill_ids: nextOrder.filter((id) => nextChecked.has(id)) });
  };

  const toggle = (id: string) => {
    if (!order || !checked) return;
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
    commit(order, next);
  };

  const handleDrop = (dropId: string) => {
    setDragOverId(null);
    if (!order || !checked || !dragId) return;
    const nextOrder = reorder(order, dragId, dropId);
    setDragId(null);
    if (nextOrder === order) return;
    setOrder(nextOrder);
    commit(nextOrder, checked);
  };

  if (skillsLoading || linksLoading || order === null || checked === null) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={240} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (skillsError || linksError) {
    return (
      <ErrorState
        body={t("skills.loadError")}
        onRetry={() => {
          void refetchSkills();
          void refetchLinks();
        }}
      />
    );
  }

  const skillById = new Map((skills ?? []).map((sk) => [sk.id, sk]));
  const visible = filterSkillsByName(skills ?? [], filter);
  const rows = order.filter((id) => visible.has(id) && skillById.has(id));
  const linkedCount = checked.size;
  const totalCount = (skills ?? []).length;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.enabledCount", { linked: linkedCount, total: totalCount })}</span>
      </div>
      <div style={s.filterRow}>
        <TextInput value={filter} onChange={setFilter} placeholder={t("skills.filterPlaceholder")} />
      </div>
      <p style={s.orderHint}>{t("skills.orderHint")}</p>
      {rows.length === 0 ? (
        <div style={s.empty}>{t("skills.noMatches")}</div>
      ) : (
        <div style={s.list}>
          {rows.map((id) => {
            const skill = skillById.get(id)!;
            const isChecked = checked.has(id);
            return (
              <div
                key={id}
                draggable
                onDragStart={() => setDragId(id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverId !== id) setDragOverId(id);
                }}
                onDragLeave={() => setDragOverId((cur) => (cur === id ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
                style={s.row(dragOverId === id)}
              >
                <span style={s.handle} aria-hidden="true">
                  <Icon.Menu size={14} />
                </span>
                <Checkbox checked={isChecked} onChange={() => toggle(id)} />
                <span style={s.name}>{skill.name}</span>
                <Badge color={SKILL_TYPE_COLOR[skill.type]}>{skill.type}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
