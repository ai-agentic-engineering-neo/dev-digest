"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, IconBtn, Skeleton, TextInput, Toggle } from "@devdigest/ui";
import { useSkills } from "@/lib/api/skills";
import { useAgentSkills, useSetAgentSkills } from "@/lib/api/agents";
import { TYPE_COLORS } from "./constants";
import { buildRows, toAttachedLinks, type SkillRow } from "./helpers";
import { orderBtnWrap, row, s, typeChip } from "./styles";

/** Skills tab: attach/detach workspace skills to this agent, toggle each on
    for the agent, and reorder the attached ones (order = prompt-block order).
    Every mutation sends the whole ordered set — see `useSetAgentSkills`. */
export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const { data: skills, isLoading: skillsLoading } = useSkills();
  const { data: links, isLoading: linksLoading } = useAgentSkills(agentId);
  const setAgentSkills = useSetAgentSkills();
  const [filter, setFilter] = React.useState("");

  // No local copy of the list: the mutation writes the next state into the
  // query cache optimistically, so this renders straight from the query and
  // there is no draft for an effect to keep in sync.
  const rows = skills && links ? buildRows(skills, links) : null;

  if (skillsLoading || linksLoading || !rows) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={200} />
        <Skeleton height={200} />
      </div>
    );
  }

  const commit = (next: SkillRow[]) =>
    setAgentSkills.mutate({ agentId, links: toAttachedLinks(agentId, next) });

  const toggleAttach = (id: string) => {
    const next = rows.map((r) => (r.skill_id === id ? { ...r, attached: !r.attached, enabled: !r.attached } : r));
    commit(sortRows(next));
  };

  const toggleEnabled = (id: string) => {
    commit(rows.map((r) => (r.skill_id === id ? { ...r, enabled: !r.enabled } : r)));
  };

  const move = (id: string, dir: -1 | 1) => {
    const attached = rows.filter((r) => r.attached);
    const rest = rows.filter((r) => !r.attached);
    const i = attached.findIndex((r) => r.skill_id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= attached.length) return;
    const a = attached[i]!;
    const b = attached[j]!;
    attached[i] = b;
    attached[j] = a;
    commit([...attached, ...rest]);
  };

  // What the badge counts is what a run will actually send: attached, on for
  // this agent, and not globally disabled. Counting attachments instead would
  // promise blocks the prompt never gets.
  const effectiveCount = rows.filter((r) => r.attached && r.enabled && r.skill_enabled).length;
  const visible = filter.trim()
    ? rows.filter((r) => r.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : rows;
  const attachedRows = rows.filter((r) => r.attached);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span title={t("skills.enabledCountTitle")}>
          <Badge>{t("skills.enabledCount", { count: effectiveCount, total: rows.length })}</Badge>
        </span>
        <div style={s.filter}>
          <TextInput value={filter} onChange={setFilter} placeholder={t("skills.filterPlaceholder")} />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>
      <div style={s.list}>
        {visible.map((r) => {
          const posInAttached = attachedRows.findIndex((a) => a.skill_id === r.skill_id);
          const isFirst = posInAttached === 0;
          const isLast = posInAttached === attachedRows.length - 1;
          return (
            <div key={r.skill_id} style={row(r.attached)}>
              {r.attached ? (
                <div style={s.order}>
                  <span style={orderBtnWrap(isFirst)}>
                    <IconBtn icon="ArrowUp" label={t("skills.moveUp")} size={20} onClick={() => move(r.skill_id, -1)} />
                  </span>
                  <span style={orderBtnWrap(isLast)}>
                    <IconBtn icon="ArrowDown" label={t("skills.moveDown")} size={20} onClick={() => move(r.skill_id, 1)} />
                  </span>
                </div>
              ) : (
                <div style={s.spacer} />
              )}
              <Checkbox checked={r.attached} onChange={() => toggleAttach(r.skill_id)} />
              <span className="mono" style={s.name}>
                {r.name}
              </span>
              <Badge style={typeChip(TYPE_COLORS[r.type])}>{r.type}</Badge>
              {!r.skill_enabled && (
                <span title={t("skills.globalDisabledTitle")}>
                  <Badge color="var(--text-muted)">{t("skills.globalDisabled")}</Badge>
                </span>
              )}
              {r.attached ? (
                <Toggle on={r.enabled} onChange={() => toggleEnabled(r.skill_id)} size={16} />
              ) : (
                <div style={s.spacer} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Re-sorts after an attach/detach so attached rows (by current order) stay
    first — cheap: the list is small (workspace skill count), and this only
    runs on attach/detach, not every render. */
function sortRows(rows: SkillRow[]): SkillRow[] {
  const attached = rows.filter((r) => r.attached);
  const unattached = rows.filter((r) => !r.attached);
  return [...attached, ...unattached];
}
