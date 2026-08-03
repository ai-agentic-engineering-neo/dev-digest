"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { TextInput } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import {
  useAgentSkillLinks,
  useSetAgentSkillEnabled,
  useSetAgentSkills,
  useWorkspaceSkills,
} from "@/lib/hooks/agents";
import { buildRows, linkedIdsInOrder, matchesFilter, moveBy, moveOnto } from "./helpers";
import { SkillRow } from "./SkillRow";
import { s } from "./styles";

/**
 * Skills tab — every workspace skill, checked when this agent has it enabled.
 *
 * Two writes, deliberately different endpoints:
 *  - checkbox → `PUT /agents/:id/skills/:skillId { enabled }` — never unlinks,
 *    so `order` survives an off/on cycle and re-checking restores the skill's
 *    place in the prompt instead of appending it to the end. The server inserts
 *    the link on the first check of a never-linked row.
 *  - drag     → `POST /agents/:id/skills { skill_ids }` with the full ordered
 *    set of LINKED ids (that call replaces the set).
 */
export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: skills } = useWorkspaceSkills();
  const { data: links } = useAgentSkillLinks(agent.id);
  const setEnabled = useSetAgentSkillEnabled();
  const setSkills = useSetAgentSkills();

  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  // Optimistic order held only while the reorder is in flight; cleared on
  // settle so a failed POST snaps back to what the server actually has.
  const [pendingOrder, setPendingOrder] = React.useState<string[] | null>(null);

  const rows = React.useMemo(
    () => buildRows(skills ?? [], links ?? [], pendingOrder),
    [skills, links, pendingOrder],
  );
  const visible = rows.filter((r) => matchesFilter(r.skill, filter));
  // Counted over the VISIBLE rows so the header and the list can never
  // disagree — same rule the findings filter chips follow.
  const enabledCount = visible.filter((r) => r.enabled).length;

  const toggle = (skillId: string, next: boolean) =>
    setEnabled.mutate({ agentId: agent.id, skillId, patch: { enabled: next } });

  const applyOrder = (order: string[]) => {
    setPendingOrder(order);
    setSkills.mutate(
      { agentId: agent.id, skillIds: linkedIdsInOrder(rows, order) },
      { onSettled: () => setPendingOrder(null) },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>
          {t("skills.enabledCount", { linked: enabledCount, total: visible.length })}
        </span>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>
      <div style={s.filter}>
        <TextInput value={filter} onChange={setFilter} placeholder={t("skills.filterPlaceholder")} />
      </div>
      <div style={s.list}>
        {visible.map((row) => (
          <SkillRow
            key={row.skill.id}
            row={row}
            reorderLabel={t("skills.reorder", { name: row.skill.name })}
            onToggle={(next) => toggle(row.skill.id, next)}
            drag={{
              active: dragId === row.skill.id,
              onStart: () => setDragId(row.skill.id),
              onEnd: () => setDragId(null),
              onDrop: () => {
                if (dragId && dragId !== row.skill.id) applyOrder(moveOnto(rows, dragId, row.skill.id));
                setDragId(null);
              },
              onMove: (delta) => applyOrder(moveBy(rows, row.skill.id, delta)),
            }}
          />
        ))}
      </div>
    </div>
  );
}
