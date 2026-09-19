/* SkillCard — name, type badge, description, enabled toggle, version, agent_count, delete. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfirmModal } from "../../../../components/confirm-modal";
import { useDeleteSkill, useUpdateSkill } from "../../../../lib/hooks/skills";
import { typeColor } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
}) {
  const t = useTranslations("skills");
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [confirming, setConfirming] = React.useState(false);
  const color = typeColor(skill.type);
  const agentCount = skill.agent_count ?? 0;
  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      {confirming && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmModal
            title={t("card.deleteTitle")}
            body={t("card.deleteConfirm", { name: skill.name })}
            confirmLabel={t("card.confirm")}
            cancelLabel={t("card.cancel")}
            pending={del.isPending}
            onClose={() => setConfirming(false)}
            onConfirm={() => del.mutate(skill.id, { onSuccess: () => setConfirming(false) })}
          />
        </div>
      )}
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span style={s.name}>{skill.name}</span>
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle
            on={skill.enabled}
            onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
            size={14}
          />
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          disabled={del.isPending}
          title={t("card.deleteTitle")}
          aria-label={t("card.deleteTitle")}
          style={{
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.typeChip(color)}>
          {t(`listItem.type.${skill.type}`)}
        </span>
        <span className="mono" style={s.metaChip}>
          {t("card.version", { version: skill.version })}
        </span>
        <span className="mono" style={s.metaChip}>
          {t("card.agentCount", { count: agentCount })}
        </span>
      </div>
    </div>
  );
}
