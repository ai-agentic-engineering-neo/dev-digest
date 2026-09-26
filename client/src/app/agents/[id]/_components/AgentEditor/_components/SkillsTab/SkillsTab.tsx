/* SkillsTab — attach workspace skills to this agent and order them. A checked
   row is linked; linked rows come first in prompt order and can be dragged or
   moved with the arrows. Rows are derived from the skills + links queries;
   every change is saved immediately (POST /agents/:id/skills, optimistic
   cache write with rollback) and bumps the agent's config version. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox, EmptyState, ErrorState, Icon, IconBtn, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { SkillTypeTag } from "../../../../../../../components/skill-type-tag";
import { filterRows, linkedIds, mergeRows, moveId, type SkillRow } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const toast = useToast();
  const skillsQ = useSkills();
  const linksQ = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();
  const [query, setQuery] = React.useState("");
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);

  const rows: SkillRow[] = React.useMemo(
    () => (skillsQ.data && linksQ.data ? mergeRows(skillsQ.data, linksQ.data) : []),
    [skillsQ.data, linksQ.data],
  );

  const commit = (ids: string[]) =>
    setSkills.mutate({ agentId: agent.id, skillIds: ids }, { onSuccess: () => toast.success(t("skills.saved")) });
  const toggle = (id: string, on: boolean) => {
    const ids = linkedIds(rows);
    commit(on ? [...ids, id] : ids.filter((x) => x !== id));
  };
  const move = (index: number, delta: number) => commit(moveId(linkedIds(rows), index, index + delta));

  const linked = rows.filter((r) => r.linked);
  const visible = filterRows(rows, query);

  if (skillsQ.isError || linksQ.isError) {
    return <ErrorState body={t("skills.emptyBody")} onRetry={() => void Promise.all([skillsQ.refetch(), linksQ.refetch()])} />;
  }
  if (skillsQ.isLoading || linksQ.isLoading) {
    return (
      <div style={s.list}>
        <Skeleton height={38} />
        <Skeleton height={38} />
        <Skeleton height={38} />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="Sparkles"
        title={t("skills.emptyTitle")}
        body={t("skills.emptyBody")}
        cta={t("skills.emptyCta")}
        onCta={() => router.push("/skills")}
      />
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent)" bg="var(--bg-hover)">
          {t("skills.enabledCount", { linked: linked.length, total: rows.length })}
        </Badge>
        <span style={s.spacer} />
        <div style={s.search}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            style={s.searchInput}
          />
        </div>
        <Button kind="secondary" size="sm" icon="Sparkles" onClick={() => router.push("/skills")}>
          {t("skills.manage")}
        </Button>
      </div>
      <div style={s.hint}>{t("skills.orderHint")}</div>
      {visible.length === 0 && <div style={s.noMatch}>{t("skills.noMatch", { query })}</div>}
      <div style={s.list} role="list">
        {visible.map((row) => {
          const index = row.linked ? linked.findIndex((r) => r.skill.id === row.skill.id) : -1;
          const draggable = row.linked && !query;
          return (
            <div
              key={row.skill.id}
              role="listitem"
              data-testid="agent-skill-row"
              style={s.row(row.linked, row.skill.enabled, dragFrom === index && index >= 0)}
              draggable={draggable}
              onDragStart={() => setDragFrom(index)}
              onDragOver={(e) => {
                if (draggable && dragFrom !== null) e.preventDefault();
              }}
              onDrop={() => {
                if (draggable && dragFrom !== null && dragFrom !== index) commit(moveId(linkedIds(rows), dragFrom, index));
                setDragFrom(null);
              }}
              onDragEnd={() => setDragFrom(null)}
            >
              <span style={s.grip(draggable)} aria-hidden>
                <Icon.Menu size={14} />
              </span>
              <span title={t("skills.attach", { name: row.skill.name })}>
                <Checkbox checked={row.linked} onChange={(on) => toggle(row.skill.id, on)} />
              </span>
              <span className="mono" style={s.name}>
                {row.skill.name}
              </span>
              {!row.skill.enabled && (
                <span title={t("skills.disabledGloballyTitle")}>
                  <Badge color="var(--text-muted)">{t("skills.disabledGlobally")}</Badge>
                </span>
              )}
              <SkillTypeTag type={row.skill.type} />
              {row.linked && (
                <span style={s.arrows}>
                  <IconBtn
                    icon="ArrowUp"
                    size={24}
                    label={t("skills.moveUp", { name: row.skill.name })}
                    onClick={() => move(index, -1)}
                  />
                  <IconBtn
                    icon="ArrowDown"
                    size={24}
                    label={t("skills.moveDown", { name: row.skill.name })}
                    onClick={() => move(index, 1)}
                  />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
