/* SkillsTab — bind/toggle/reorder workspace skills for one agent. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox, Icon, Skeleton } from "@devdigest/ui";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { TYPE_COLOR } from "./constants";
import {
  applyDrop,
  enabledCount,
  filterSkillRows,
  mergeCatalogWithLinks,
  toBindings,
  toggleRow,
} from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const catalog = useSkills();
  const links = useAgentSkills(agentId);
  const save = useSetAgentSkills(agentId);
  const [q, setQ] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);

  const rows = mergeCatalogWithLinks(catalog.data ?? [], links.data ?? []);
  const visible = filterSkillRows(rows, q);
  const { n, m } = enabledCount(visible);

  const persist = (next: typeof rows) => {
    save.mutate(toBindings(next));
  };

  if (catalog.isLoading || links.isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={220} />
        <Skeleton height={160} />
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.enabledCount", { linked: n, total: m })}</span>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("skills.filterPlaceholder")}
        style={s.filter}
        aria-label={t("skills.filterPlaceholder")}
      />
      {visible.map((row) => (
        <div
          key={row.skill_id}
          draggable
          onDragStart={() => setDragId(row.skill_id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (!dragId) return;
            persist(applyDrop(rows, dragId, row.skill_id));
            setDragId(null);
          }}
          style={s.row(!row.skill_enabled)}
        >
          <span style={s.handle} aria-label="Reorder">
            <Icon.Menu size={14} />
          </span>
          <Checkbox
            checked={row.enabled}
            onChange={(on) => persist(toggleRow(rows, row.skill_id, on))}
            label={row.name}
          />
          <span style={{ flex: 1 }} />
          <span className="mono" style={s.chip(TYPE_COLOR[row.type] ?? "var(--text-secondary)")}>
            {row.type}
          </span>
        </div>
      ))}
    </div>
  );
}
