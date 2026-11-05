/* SkillsTab — the agent's Skills (Agent Editor · Skills design). One column of
   bounded width: "Skills" + "N of M enabled", a hint, a full-width filter, and
   a row per workspace skill: toggle on = linked to this agent. Linked skills
   come first in prompt order, show their position (#1, #2…) and can be dragged
   (or moved with ↑/↓) — order is the order of the skill blocks in the
   assembled prompt. Every control has a visible label or a tooltip, and rows
   show the skill's description (see SkillRow). Each change saves at once. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { buildSkillRows, linkedIds, matchesFilter, moveLinked, toggleLinked } from "./helpers";
import { s } from "./styles";
import { SkillRow } from "./_components/SkillRow";
import { errorMessage } from "@/lib/error-message";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const skillsQ = useSkills();
  const linksQ = useAgentSkills(agent.id);
  const setLinks = useSetAgentSkills(agent.id);
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  if (skillsQ.isLoading || linksQ.isLoading) {
    return (
      <div style={s.list}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }
  if (skillsQ.isError || linksQ.isError) {
    return (
      <ErrorState
        body={t("skills.loadError")}
        onRetry={() => {
          void skillsQ.refetch();
          void linksQ.refetch();
        }}
      />
    );
  }

  const skills = skillsQ.data ?? [];
  const rows = buildSkillRows(skills, linkedIds(linksQ.data ?? []));
  // Derived from rows (not from the raw links) so links to deleted skills are
  // dropped: `position` indexes into exactly this list, and saves stay valid.
  const ids = rows.filter((r) => r.linked).map((r) => r.skill.id);
  const linkedCount = ids.length;
  const visible = rows.filter((r) => matchesFilter(r.skill, filter));

  const save = (next: string[]) =>
    setLinks.mutate(next, { onError: (e) => toast.error(`${t("skills.saveError")}: ${errorMessage(e)}`) });

  const onDrop = (targetId: string) => {
    if (dragId && dragId !== targetId) {
      const to = ids.indexOf(targetId);
      if (to !== -1) save(moveLinked(ids, dragId, to));
    }
    setDragId(null);
    setOverId(null);
  };

  return (
    <div style={s.column}>
      <div style={s.header}>
        <h2 style={s.title}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.enabledCount", { linked: linkedCount, total: skills.length })}</span>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>
      <div style={s.filter}>
        <Icon.Search size={14} style={{ color: "var(--text-muted)" }} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("skills.filterPlaceholder")}
          aria-label={t("skills.filterPlaceholder")}
          style={s.filterInput}
        />
      </div>

      {skills.length === 0 ? (
        <p style={s.empty}>
          {t("skills.empty")}{" "}
          <Link href="/skills" style={s.link}>
            {t("skills.manage")}
          </Link>
        </p>
      ) : visible.length === 0 ? (
        <p style={s.empty}>{t("skills.noMatch")}</p>
      ) : (
        <div style={s.list} role="list">
          {visible.map(({ skill, linked, position }) => (
            <SkillRow
              key={skill.id}
              skill={skill}
              linked={linked}
              position={position}
              linkedCount={linkedCount}
              onToggle={() => save(toggleLinked(ids, skill.id))}
              onMove={(to) => save(moveLinked(ids, skill.id, to))}
              drag={{
                over: overId === skill.id,
                onStart: () => setDragId(skill.id),
                onOver: () => {
                  if (!dragId || !linked) return false;
                  setOverId(skill.id);
                  return true;
                },
                onLeave: () => setOverId((o) => (o === skill.id ? null : o)),
                onDrop: () => onDrop(skill.id),
                onEnd: () => {
                  setDragId(null);
                  setOverId(null);
                },
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
