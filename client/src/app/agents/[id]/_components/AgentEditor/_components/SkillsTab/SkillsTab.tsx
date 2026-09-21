/* SkillsTab — which skills this agent uses, and in what order. The list IS the
   prompt: row order is block order, and an unchecked row is simply absent from
   the assembled prompt rather than present-and-ignored. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/skills";
import { typeColor } from "../../../../../../skills/_components/SkillCard";
import { buildRows, countEnabled, filterRows, reorder, toLinkPayload, type SkillRow } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const tSkills = useTranslations("skills");
  const skillsQuery = useSkills();
  const linksQuery = useAgentSkills(agent.id);
  const save = useSetAgentSkills(agent.id);

  const [search, setSearch] = React.useState("");
  const [dragging, setDragging] = React.useState<number | null>(null);

  /**
   * Server state is the source of truth, but a drag has to repaint on every
   * `dragover` — far faster than a round trip. So rows are derived from the
   * queries and only shadowed by local state while a reorder is in flight.
   */
  const serverRows = React.useMemo(
    () => buildRows(skillsQuery.data ?? [], linksQuery.data ?? []),
    [skillsQuery.data, linksQuery.data],
  );
  const [draft, setDraft] = React.useState<SkillRow[] | null>(null);
  const rows = draft ?? serverRows;

  const commit = (next: SkillRow[]) => {
    setDraft(next);
    save.mutate(toLinkPayload(next), {
      // Drop the shadow once the server has echoed the list back, so the two
      // can't drift; on failure the same reset snaps the UI back to reality.
      onSettled: () => setDraft(null),
    });
  };

  const toggle = (index: number) => {
    const row = rows[index]!;
    const next = [...rows];
    // One checkbox drives both facts: an unlinked skill becomes linked+on,
    // a linked one just flips its per-agent switch (keeping its position).
    next[index] = row.linked
      ? { ...row, enabled: !row.enabled }
      : { ...row, linked: true, enabled: true };
    commit(next);
  };

  const onDrop = (to: number) => {
    if (dragging === null) return;
    const next = reorder(rows, dragging, to);
    setDragging(null);
    if (next !== rows) commit(next);
  };

  if (skillsQuery.isError || linksQuery.isError) {
    return <ErrorState body={tSkills("page.loadError")} onRetry={() => void skillsQuery.refetch()} />;
  }
  if (skillsQuery.isLoading || linksQuery.isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={28} width={220} />
        <Skeleton height={180} />
      </div>
    );
  }

  const visible = filterRows(rows, search);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent)">
          {t("skills.enabledCount", { linked: countEnabled(rows), total: rows.length })}
        </Badge>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            style={s.searchInput}
            aria-label={t("skills.filterPlaceholder")}
          />
        </div>
      </div>

      <p style={s.hint}>{t("skills.orderHint")}</p>

      {rows.length === 0 ? (
        <p style={s.empty}>{tSkills("page.empty.body")}</p>
      ) : (
        <ul style={s.list}>
          {visible.map((row) => {
            // Drag indices address the FULL list: filtering must not silently
            // reorder rows the user can't currently see.
            const index = rows.indexOf(row);
            return (
              <li
                key={row.skill.id}
                draggable
                onDragStart={() => setDragging(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(index)}
                onDragEnd={() => setDragging(null)}
                style={s.row(row.linked && row.enabled, dragging === index)}
              >
                <span style={s.handle} aria-hidden="true">
                  <Icon.Menu size={14} />
                </span>
                <div style={s.checkboxWrap}>
                  <Checkbox
                    checked={row.linked && row.enabled}
                    onChange={() => toggle(index)}
                    label={
                      <span className="mono" style={s.skillName}>
                        {row.skill.name}
                      </span>
                    }
                  />
                </div>
                <span className="mono" style={s.typeChip(typeColor(row.skill.type))}>
                  {tSkills(`listItem.type.${row.skill.type}`)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
