/* SkillsTab — the agent's Skills (Agent Editor · Skills design). Every
   workspace skill is a row; checked = linked to this agent. Linked skills come
   first in prompt order and can be dragged (or moved with ↑/↓) — order is the
   order of the skill blocks in the assembled prompt. Each change saves at once. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { SkillTypeBadge } from "../../../../../../../components/skill-type-badge";
import { useAgentSkills, useSetAgentSkills, useSkills } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { buildSkillRows, linkedIds, matchesFilter, moveLinked, toggleLinked } from "./helpers";
import { s } from "./styles";
import { errorMessage } from "@/lib/error-message";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const tSkills = useTranslations("skills");
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
    <div>
      <div style={s.header}>
        <h2 style={s.title}>{t("skills.title")}</h2>
        <Badge color="var(--accent)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: linkedCount, total: skills.length })}
        </Badge>
        <div style={s.filter}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

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
            <div
              key={skill.id}
              role="listitem"
              data-testid={`skill-row-${skill.name}`}
              style={s.row(linked, overId === skill.id)}
              draggable={linked}
              onDragStart={(e) => {
                setDragId(skill.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!dragId || !linked) return;
                e.preventDefault();
                setOverId(skill.id);
              }}
              onDragLeave={() => setOverId((o) => (o === skill.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(skill.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
            >
              <span style={s.handle(linked)} title={t("skills.dragHandle", { name: skill.name })} aria-hidden>
                <Icon.Menu size={14} />
              </span>
              <div style={{ ...s.name, ...(skill.enabled ? {} : s.muted) }}>
                <Checkbox
                  checked={linked}
                  onChange={() => save(toggleLinked(ids, skill.id))}
                  label={
                    <span className="mono" title={skill.description}>
                      {skill.name}
                    </span>
                  }
                />
              </div>
              {(skill.source === "community" || skill.source === "imported_url") && (
                <Badge color="var(--warn)" bg="var(--warn-bg)">
                  {t("skills.imported")}
                </Badge>
              )}
              {!skill.enabled && (
                <span title={t("skills.disabledGloballyTitle")}>
                  <Badge color="var(--text-muted)">{t("skills.disabledGlobally")}</Badge>
                </span>
              )}
              {linked && (
                <div style={s.arrows}>
                  <button
                    type="button"
                    style={s.arrowBtn}
                    aria-label={t("skills.moveUp", { name: skill.name })}
                    disabled={position === 0}
                    onClick={() => save(moveLinked(ids, skill.id, position - 1))}
                  >
                    <Icon.ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    style={s.arrowBtn}
                    aria-label={t("skills.moveDown", { name: skill.name })}
                    disabled={position === linkedCount - 1}
                    onClick={() => save(moveLinked(ids, skill.id, position + 1))}
                  >
                    <Icon.ArrowDown size={13} />
                  </button>
                </div>
              )}
              <SkillTypeBadge type={skill.type} label={tSkills(`type.${skill.type}`)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
