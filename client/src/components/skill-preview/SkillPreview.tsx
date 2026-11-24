/* SkillPreview — read-only view of a skill: metadata badges, the untrusted-content
   notice, description and the rendered markdown body. Shared by the list page's
   preview panel and the skill page's Preview tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SKILL_TYPE_STYLE } from "@/lib/skill-type";
import { s } from "./styles";

export function SkillPreview({ skill, agentCount }: { skill: Skill; agentCount?: number }) {
  const t = useTranslations("skills");
  const style = SKILL_TYPE_STYLE[skill.type];
  return (
    <div style={s.wrap}>
      <div style={s.meta}>
        <Badge color={style.color} bg={style.bg}>
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        <Badge mono>{t("preview.version", { version: skill.version })}</Badge>
        <Badge color={skill.enabled ? "var(--ok)" : "var(--text-muted)"} dot>
          {skill.enabled ? t("preview.enabled") : t("preview.disabled")}
        </Badge>
        {agentCount !== undefined && <Badge icon="Cpu">{t("card.agentCount", { count: agentCount })}</Badge>}
        <Badge>{t(`preview.sources.${skill.source}`)}</Badge>
      </div>
      <div role="note" style={s.notice}>
        <Icon.AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>{t("preview.untrustedNotice")}</span>
      </div>
      {skill.description && (
        <div>
          <div style={s.label}>{t("preview.descriptionLabel")}</div>
          <div style={s.text}>{skill.description}</div>
        </div>
      )}
      <div>
        <div style={s.label}>{t("preview.bodyLabel")}</div>
        <div style={s.body}>
          <Markdown>{skill.body}</Markdown>
        </div>
      </div>
    </div>
  );
}
