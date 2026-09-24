/* AgentCard — model chip, linked-skills count, enabled toggle. The count comes
   from the agent's own links query (useAgentSkillLinks), shared with the
   Skills tab cache. Delete opens DeleteAgentModal. Stats are an A5 mount. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, IconBtn, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkillLinks } from "@/lib/hooks";
import { DeleteAgentModal } from "../DeleteAgentModal";
import { modelColor } from "./helpers";
import { s } from "./styles";

export function AgentCard({
  ag,
  active,
  onClick,
  onToggle,
}: {
  ag: Agent;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("agents");
  const [deleting, setDeleting] = React.useState(false);
  const skillCount = useAgentSkillLinks(ag.id).data?.length;
  const color = modelColor(ag.model);
  return (
    <>
      <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
        <div style={s.headerRow}>
          <div style={s.iconBox}>
            <Icon.Cpu size={15} />
          </div>
          <span style={s.name}>{ag.name}</span>
          {onToggle && (
            <div onClick={(e) => e.stopPropagation()}>
              <Toggle on={ag.enabled} onChange={onToggle} size={14} />
            </div>
          )}
          {/* Wrapper stops the click on the card (which would open the agent). */}
          <span onClick={(e) => e.stopPropagation()} style={s.deleteWrap}>
            <IconBtn icon="Trash" danger size={26} label={t("card.delete")} onClick={() => setDeleting(true)} />
          </span>
        </div>
        <div style={s.description}>{ag.description || t("card.noDescription")}</div>
        <div style={s.metaRow}>
          <span className="mono" style={s.modelChip(color)}>
            {ag.model}
          </span>
          {skillCount != null && (
            <Badge color="var(--text-secondary)" icon="Sparkles">
              {t("card.skillCount", { count: skillCount })}
            </Badge>
          )}
        </div>
      </div>
      {deleting && <DeleteAgentModal agent={ag} onClose={() => setDeleting(false)} onDeleted={() => setDeleting(false)} />}
    </>
  );
}
