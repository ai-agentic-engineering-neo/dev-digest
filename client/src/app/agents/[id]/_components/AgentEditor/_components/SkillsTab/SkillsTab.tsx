/* SkillsTab — the agent's Skills (Agent Editor · Skills design). One column of
   bounded width: "Skills" + "N of M enabled", a hint, a full-width filter, and
   a row per workspace skill: toggle on = linked to this agent. Linked skills
   come first in prompt order, show their position (#1, #2…) and can be dragged
   (or moved with ↑/↓) — order is the order of the skill blocks in the
   assembled prompt. Every control has a visible label or a tooltip, and rows
   show the skill's description. Each change saves at once. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, Skeleton, Toggle } from "@devdigest/ui";
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
              <span
                style={s.handle(linked)}
                title={linked ? t("skills.dragHandle", { name: skill.name }) : undefined}
                aria-hidden
              >
                {linked && <Icon.Menu size={14} />}
              </span>
              <span title={t("skills.attachTitle")} style={s.toggle}>
                <Toggle
                  on={linked}
                  onChange={() => save(toggleLinked(ids, skill.id))}
                  size={14}
                  label={t("skills.attach", { name: skill.name })}
                />
              </span>
              {/* Not clickable: the switch is the only control, so selecting /
                  double-clicking the name never saves. */}
              <div style={{ ...s.nameBlock, ...(skill.enabled ? {} : s.muted) }}>
                <span className="mono" style={s.name(linked)}>
                  {skill.name}
                </span>
                <span style={s.description}>{skill.description || t("skills.noDescription")}</span>
              </div>
              {(skill.source === "community" || skill.source === "imported_url") && (
                <span title={t("skills.importedTitle")}>
                  <Badge color="var(--warn)" bg="var(--warn-bg)">
                    {t("skills.imported")}
                  </Badge>
                </span>
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
                    title={t("skills.moveUpTitle")}
                    disabled={position === 0}
                    onClick={() => save(moveLinked(ids, skill.id, position - 1))}
                  >
                    <Icon.ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    style={s.arrowBtn}
                    aria-label={t("skills.moveDown", { name: skill.name })}
                    title={t("skills.moveDownTitle")}
                    disabled={position === linkedCount - 1}
                    onClick={() => save(moveLinked(ids, skill.id, position + 1))}
                  >
                    <Icon.ArrowDown size={13} />
                  </button>
                </div>
              )}
              <span title={t("skills.typeTitle")}>
                <SkillTypeBadge type={skill.type} label={tSkills(`type.${skill.type}`)} />
              </span>
              <span
                className="mono"
                style={s.position}
                title={linked ? t("skills.positionTitle", { position: position + 1 }) : undefined}
              >
                {linked ? t("skills.position", { position: position + 1 }) : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
