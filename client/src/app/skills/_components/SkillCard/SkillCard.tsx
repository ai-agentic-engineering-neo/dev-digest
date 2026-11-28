/* SkillCard — one skill in the list column: type icon, mono name, enabled
   toggle, description, type badge, source label and agent count. A disabled
   skill is dimmed. The pull % / accept % slots arrive in M7. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge, SkillTypeIcon } from "@/components/skill-type";
import { isInteractiveTarget } from "@/lib/keyboard";
import { SOURCE_META } from "./constants";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  href,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  href: string;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const linkRef = React.useRef<HTMLAnchorElement>(null);
  const source = SOURCE_META[skill.source];
  const SourceIcon = Icon[source.icon];
  return (
    // The whole card forwards a click to the name link, so every way of opening
    // a skill goes through the same link (and the unsaved-edits guard).
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      onClick={(e) => {
        if (!isInteractiveTarget(e.target)) linkRef.current?.click();
      }}
      style={s.card(!!active, skill.enabled)}
    >
      <div style={s.headerRow}>
        <SkillTypeIcon type={skill.type} />
        <Link ref={linkRef} href={href} className="mono" style={s.name} aria-current={active ? "page" : undefined}>
          {skill.name}
        </Link>
        <Toggle
          on={skill.enabled}
          onChange={onToggle}
          size={14}
          aria-label={t("card.toggleLabel", { name: skill.name })}
        />
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} />
        <span style={s.source}>
          <SourceIcon size={12} />
          {t(`card.source.${source.labelKey}`)}
        </span>
      </div>
      <div style={s.footer}>{t("card.agents", { count: skill.agent_count })}</div>
    </div>
  );
}
