/* AgentCard — model chip, skills count, enabled toggle. Stats are an A5 mount;
   we render the provider/model + skill count here. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { isInteractiveTarget } from "@/lib/keyboard";
import { useDeleteAgent } from "../../../../lib/hooks/agents";
import { modelColor } from "./helpers";
import { s } from "./styles";

export function AgentCard({
  ag,
  active,
  skillCount,
  href,
  onToggle,
}: {
  ag: Agent;
  active?: boolean;
  skillCount?: number;
  href: string;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("agents");
  const router = useRouter();
  const del = useDeleteAgent();
  const [confirming, setConfirming] = React.useState(false);
  const color = modelColor(ag.model);
  return (
    <>
      {/* Whole-card click is a mouse convenience; the name is the real link for keyboard and open-in-new-tab. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        onClick={(e) => {
          if (!isInteractiveTarget(e.target)) router.push(href);
        }}
        style={s.card(!!active, ag.enabled)}
      >
        <div style={s.headerRow}>
          <div style={s.iconBox}>
            <Icon.Cpu size={15} />
          </div>
          <Link href={href} style={s.name}>
            {ag.name}
          </Link>
          {onToggle && <Toggle on={ag.enabled} onChange={onToggle} size={14} />}
          <button
            onClick={() => setConfirming(true)}
            disabled={del.isPending}
            title={t("card.deleteButton")}
            aria-label={t("card.deleteButton")}
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
      {confirming && (
        <ConfirmDialog
          title={t("card.deleteTitle")}
          message={t("card.deleteConfirm", { name: ag.name })}
          confirmLabel={t("card.deleteLabel")}
          onConfirm={() => {
            setConfirming(false);
            del.mutate(ag.id);
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
