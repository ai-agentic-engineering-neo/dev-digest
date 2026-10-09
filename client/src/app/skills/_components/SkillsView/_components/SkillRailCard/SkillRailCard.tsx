/* SkillRailCard — one row of the /skills rail. AgentCard is the template; the
   stats footer ("3 agents · 71% pull · 74% accept") is the new part and is fed
   by the LIST endpoint's batched stats — never a request per card. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { SkillWithStats } from "@devdigest/shared";
import { TYPE_COLOR } from "../../constants";
import { footerSegments } from "./helpers";
import { s } from "./styles";

export function SkillRailCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: SkillWithStats;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const segments = footerSegments(skill.stats);
  // Imported skills land disabled and stay flagged until someone reads the body.
  const needsVetting = skill.source === "imported_url" && !skill.enabled;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={s.card(!!active, skill.enabled)}
    >
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
      </div>

      <div style={s.description}>{skill.description || t("listItem.noDescription")}</div>

      <div style={s.badgeRow}>
        <Badge color={TYPE_COLOR[skill.type]}>{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge color="var(--text-muted)">{t(`listItem.source.${skill.source}`)}</Badge>
        {needsVetting && (
          <Badge color="var(--warn)" icon="AlertTriangle" style={{ cursor: "help" }}>
            {t("listItem.needsVetting")}
          </Badge>
        )}
      </div>

      <div style={s.footer}>
        {segments.map((seg, i) => (
          <React.Fragment key={seg.key}>
            {i > 0 && <span style={s.sep}>·</span>}
            <span className="tnum">
              {seg.key === "agents"
                ? t("listItem.agents", { count: seg.value })
                : t(`listItem.${seg.key}`, { pct: seg.value })}
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
