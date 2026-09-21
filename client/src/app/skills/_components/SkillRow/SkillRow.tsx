/* SkillRow — one skill in the /skills list and in the /skills/[id] side panel:
   icon, mono name, enabled toggle + trash, type / "source · version" badges and the
   "{n} agents · {x}% pull · {y}% accept" metrics line. An injection-flagged skill is
   red-tinted with a badge and a locked toggle. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, IconBtn, SkillTypeTag } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { DeleteSkillDialog } from "../DeleteSkillDialog";
import { InjectionBadge } from "../InjectionBadge";
import { SkillEnabledToggle } from "../SkillEnabledToggle";
import { SOURCE_META } from "./constants";
import { formatPercent, needsVetting } from "./helpers";
import { s } from "./styles";

export function SkillRow({
  skill,
  active,
  onClick,
  onToggle,
  onDeleted,
}: {
  skill: SkillListItem;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  /** Called after the skill was deleted from this row (e.g. to leave its detail page). */
  onDeleted?: () => void;
}) {
  const t = useTranslations("skills");
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const source = SOURCE_META[skill.source];
  const none = t("list.metrics.none");
  const blocked = skill.injection_detected;
  // The dialog is a sibling (not a child) of the card so the card's opacity/click handler never touch it.
  return (
    <>
      <div onClick={onClick} style={s.card(!!active, skill.enabled, blocked)}>
        <div style={s.headerRow}>
          <div style={s.iconBox(blocked)}>
            <Icon.Sparkles size={15} />
          </div>
          <span className="mono" style={s.name}>
            {skill.name}
          </span>
          {blocked && <InjectionBadge />}
          {onToggle && (
            <div onClick={(e) => e.stopPropagation()}>
              <SkillEnabledToggle
                on={skill.enabled}
                blocked={blocked}
                onChange={onToggle}
                title={t("list.toggleAria", { name: skill.name })}
              />
            </div>
          )}
          <div onClick={(e) => e.stopPropagation()}>
            <IconBtn
              icon="Trash"
              danger
              size={26}
              label={t("delete.aria", { name: skill.name })}
              onClick={() => setConfirmingDelete(true)}
            />
          </div>
        </div>
        <div style={s.description}>{skill.description || t("list.noDescription")}</div>
        <div style={s.tagRow}>
          <SkillTypeTag type={skill.type} label={t(`listItem.type.${skill.type}`)} />
          <Badge color="var(--text-secondary)" bg="transparent" icon={source.icon} style={{ padding: "2px 0" }}>
            {t("list.sourceVersion", { source: t(source.labelKey), version: skill.version })}
          </Badge>
          {needsVetting(skill.source) && (
            <span style={s.vetting} title={t("listItem.vettingTitle")}>
              {t("listItem.needsVetting")}
            </span>
          )}
        </div>
        <div style={s.metrics}>
          <span>{t("list.metrics.usedBy", { count: skill.used_by })}</span>
          <span aria-hidden>·</span>
          <span>{t("list.metrics.pull", { value: formatPercent(skill.pull_rate) ?? none })}</span>
          <span aria-hidden>·</span>
          <span style={skill.accept_rate == null ? undefined : s.accept}>
            {t("list.metrics.accept", { value: formatPercent(skill.accept_rate) ?? none })}
          </span>
        </div>
      </div>
      {confirmingDelete && (
        <DeleteSkillDialog
          skill={skill}
          usedBy={skill.used_by}
          onClose={() => setConfirmingDelete(false)}
          onDeleted={onDeleted}
        />
      )}
    </>
  );
}
