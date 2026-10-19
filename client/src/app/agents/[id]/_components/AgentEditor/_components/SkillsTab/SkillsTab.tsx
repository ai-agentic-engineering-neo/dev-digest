/* SkillsTab — link workspace skills to this agent, enable/disable each link and
   set their order (= order of the skill blocks in the assembled prompt). Every
   change is saved immediately via PUT /agents/:id/skills. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkillLinks, useSetAgentSkills, useSkills } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { SkillTypeBadge } from "../../../../../../../components/skill-type-badge";
import { activeCount, buildRows, filterRows, moveRow, toLinkItems, toggleRow, type SkillRow } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const skills = useSkills();
  const links = useAgentSkillLinks(agent.id);
  const save = useSetAgentSkills(agent.id);
  const [rows, setRows] = React.useState<SkillRow[] | null>(null);
  const [filter, setFilter] = React.useState("");
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);

  // Server state → local rows (re-sync whenever either query refreshes).
  React.useEffect(() => {
    if (skills.data && links.data) setRows(buildRows(skills.data, links.data));
  }, [skills.data, links.data]);

  const commit = (next: SkillRow[]) => {
    const prev = rows;
    setRows(next);
    save.mutate(toLinkItems(next), {
      onError: (err) => {
        setRows(prev);
        toast.error(t("skills.saveError", { message: (err as Error).message }));
      },
    });
  };

  if (skills.isError || links.isError) {
    return <ErrorState body={t("skills.loadError")} onRetry={() => (skills.refetch(), links.refetch())} />;
  }
  if (!rows) {
    return (
      <div style={s.wrap}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }

  const visible = filterRows(rows, filter);
  const canReorder = filter.trim() === "";

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent)">{t("skills.enabledCount", { linked: activeCount(rows), total: rows.length })}</Badge>
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {rows.length === 0 && <div style={s.empty}>{t("skills.empty")}</div>}
      {rows.length > 0 && visible.length === 0 && <div style={s.empty}>{t("skills.noMatch")}</div>}

      <ol style={s.list} aria-label={t("skills.title")}>
        {visible.map((row) => {
          const index = rows.indexOf(row);
          const { skill } = row;
          return (
            <li
              key={skill.id}
              draggable={canReorder}
              onDragStart={() => setDragFrom(index)}
              onDragOver={(e) => canReorder && e.preventDefault()}
              onDrop={() => {
                if (dragFrom !== null) commit(moveRow(rows, dragFrom, index));
                setDragFrom(null);
              }}
              onDragEnd={() => setDragFrom(null)}
              style={s.row(row.enabled, dragFrom === index)}
            >
              <button
                type="button"
                aria-label={t("skills.drag", { name: skill.name })}
                title={t("skills.drag", { name: skill.name })}
                disabled={!canReorder}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault();
                    commit(moveRow(rows, index, index + (e.key === "ArrowUp" ? -1 : 1)));
                  }
                }}
                style={s.grip(canReorder)}
              >
                <Icon.Menu size={15} />
              </button>
              <Checkbox
                checked={row.enabled}
                onChange={() => commit(toggleRow(rows, skill.id))}
                label={
                  <span className="mono" style={s.name}>
                    {skill.name}
                  </span>
                }
              />
              {!skill.enabled && <Badge color="var(--text-muted)">{t("skills.globallyDisabled")}</Badge>}
              <span style={s.spacer} />
              <SkillTypeBadge type={skill.type} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
