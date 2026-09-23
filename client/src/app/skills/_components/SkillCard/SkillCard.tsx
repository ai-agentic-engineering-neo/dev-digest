/* SkillCard — one skill in the /skills grid: type icon + badge, name, current
   version, description, source, enabled switch (optimistic), linked agents and
   the pull % · accept % from GET /skills/stats. Click opens the preview drawer;
   the trash button opens the shared DeleteSkillModal. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn, Toggle } from "@devdigest/ui";
import type { Skill, SkillStatsSummary } from "@devdigest/shared";
import { useToggleSkill } from "@/lib/hooks";
import { SKILL_TYPE_STYLE, SkillTypeBadge } from "@/components/skill-type-badge";
import { formatRate } from "../../helpers";
import { DeleteSkillModal } from "../DeleteSkillModal";
import { s } from "./styles";

export function SkillCard({
  skill,
  stats,
  onOpen,
}: {
  skill: Skill;
  stats?: SkillStatsSummary;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("skills");
  const toggle = useToggleSkill();
  const [deleting, setDeleting] = React.useState(false);
  const { icon, color } = SKILL_TYPE_STYLE[skill.type];
  const TypeIcon = Icon[icon];
  const imported = skill.source !== "manual";
  const pull = formatRate(stats?.pull_rate) ?? t("card.noStat");
  const accept = formatRate(stats?.accept_rate) ?? t("card.noStat");

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={skill.name}
        data-testid="skill-card"
        onClick={() => onOpen(skill.id)}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onOpen(skill.id);
          }
        }}
        style={s.card(skill.enabled)}
      >
        <div style={s.header}>
          <div style={s.iconBox(color)}>
            <TypeIcon size={15} />
          </div>
          <span className="mono" style={s.name}>
            {skill.name}
          </span>
          <span className="mono tnum" title={t("card.versionTitle", { version: skill.version })} style={s.version}>
            v{skill.version}
          </span>
          {/* The label names the switch; stopPropagation keeps the card closed. */}
          <label onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} style={s.switchWrap}>
            <span style={s.srOnly}>{t("card.enableLabel", { name: skill.name })}</span>
            <Toggle on={skill.enabled} onChange={(enabled) => toggle.mutate({ id: skill.id, enabled })} size={14} />
          </label>
          {/* Wrapper stops the click on the card (which would open the preview). */}
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} style={s.switchWrap}>
            <IconBtn
              icon="Trash"
              danger
              size={26}
              label={t("card.deleteLabel", { name: skill.name })}
              onClick={() => setDeleting(true)}
            />
          </span>
        </div>
        <div style={s.description}>{skill.description}</div>
        <div style={s.meta}>
          <SkillTypeBadge type={skill.type} />
          <span title={imported && skill.source_ref ? t("card.sourceTitle", { ref: skill.source_ref }) : undefined}>
            <Badge color={imported ? "var(--warn)" : "var(--text-muted)"} icon={imported ? "Upload" : undefined}>
              {t(`source.${skill.source}`)}
            </Badge>
          </span>
        </div>
        <div style={s.footer}>
          <span style={s.footerItem}>
            <Icon.Cpu size={12} />
            {t("card.agents", { count: skill.used_by ?? 0 })}
          </span>
          <span className="tnum" style={s.stats}>
            {t("card.pull", { value: pull })} · {t("card.accept", { value: accept })}
          </span>
        </div>
      </div>
      {deleting && (
        <DeleteSkillModal skill={skill} onClose={() => setDeleting(false)} onDeleted={() => setDeleting(false)} />
      )}
    </>
  );
}
