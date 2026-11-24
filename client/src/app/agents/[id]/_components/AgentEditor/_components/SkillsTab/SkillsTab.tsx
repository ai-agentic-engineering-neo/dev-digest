/* SkillsTab — which skills this agent uses, and in what order. A link present
   == skill on for this agent; every change posts the full ordered id list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { SkillRow } from "./_components/SkillRow";
import { dropOn, filterRows, linkedIds, moveById, orderRows, toggleLinked } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const skillsQ = useSkills();
  const linksQ = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills(agent.id);
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  const skills = skillsQ.data ?? [];
  const ids = linkedIds(linksQ.data ?? [], skills);
  const rows = orderRows(skills, ids);
  const visible = filterRows(rows, filter);

  const save = (next: string[]) => {
    if (next !== ids) setSkills.mutate(next);
  };
  const endDrag = () => {
    setDragId(null);
    setOverId(null);
  };

  if (skillsQ.isError || linksQ.isError) {
    return <ErrorState body={t("skillsTab.loadError")} onRetry={() => (skillsQ.refetch(), linksQ.refetch())} />;
  }
  if (skillsQ.isLoading || linksQ.isLoading) return <Skeleton height={160} />;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.title}>{t("skillsTab.title")}</h2>
        <Badge color="var(--accent)" bg="var(--accent-bg)">
          {t("skillsTab.enabledCount", { enabled: ids.length, total: skills.length })}
        </Badge>
        <div style={s.spacer} />
        <div style={s.filter}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skillsTab.filterPlaceholder")}
            aria-label={t("skillsTab.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skillsTab.hint")}</p>
      {skills.length === 0 ? (
        <div style={s.muted}>{t("skillsTab.empty")}</div>
      ) : visible.length === 0 ? (
        <div style={s.muted}>{t("skillsTab.noMatch")}</div>
      ) : (
        <div style={s.list}>
          {visible.map(({ skill, linked }) => {
            const i = ids.indexOf(skill.id);
            return (
              <SkillRow
                key={skill.id}
                skill={skill}
                linked={linked}
                canUp={i > 0}
                canDown={linked && i < ids.length - 1}
                dragOver={!!dragId && overId === skill.id && dragId !== skill.id}
                onToggle={(on) => save(toggleLinked(ids, skill.id, on))}
                onMove={(delta) => save(moveById(ids, skill.id, delta))}
                onDragStart={() => setDragId(skill.id)}
                onDragOver={() => linked && dragId && setOverId(skill.id)}
                onDrop={() => {
                  if (dragId && linked) save(dropOn(ids, dragId, skill.id));
                  endDrag();
                }}
                onDragEnd={endDrag}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
