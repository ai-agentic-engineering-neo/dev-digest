/* SkillsTab — the skills linked to an agent, in prompt order. Each row has a
   drag handle (also Alt+↑/↓), the per-link checkbox, the name, a "disabled
   globally" tag, the type badge and Detach. Every change posts the full ordered
   list at once; the list updates optimistically and rolls back on error. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox, Dropdown, ErrorState, Icon, IconBtn, Skeleton } from "@devdigest/ui";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "@/components/skill-type";
import { useAgentSkills, useSetAgentSkills } from "@/lib/hooks/agents";
import { useSkills } from "@/lib/hooks/skills";
import { ATTACH_MENU_WIDTH } from "./constants";
import {
  canMove,
  countEnabledLinks,
  filterLinks,
  isReorderable,
  moveDelta,
  moveItem,
  newLink,
  removeLink,
  renumber,
  setLinkEnabled,
  toLinkPayload,
  unlinkedSkills,
} from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const { data: links, isLoading, isError, refetch } = useAgentSkills(agentId);
  const { data: skills } = useSkills();
  const setLinks = useSetAgentSkills();
  const [filter, setFilter] = React.useState("");
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const all = links ?? [];
  const shown = filterLinks(all, filter);
  const reorderable = isReorderable(filter);
  const candidates = unlinkedSkills(skills ?? [], all);

  const commit = (next: AgentSkillLink[]) =>
    setLinks.mutate({ agentId, skills: toLinkPayload(next), optimistic: renumber(next) });
  const move = (from: number, to: number) => {
    if (!canMove(all.length, from, to)) return;
    const id = all[from]?.skill_id;
    commit(moveItem(all, from, to));
    // Keep keyboard focus on the moved row's handle.
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-handle="${id}"]`)?.focus());
  };
  const toggle = (skillId: string, enabled: boolean) => commit(setLinkEnabled(all, skillId, enabled));
  const attach = (skill: Skill) => commit([...all, newLink(agentId, skill, all.length)]);
  const detach = (skillId: string) => commit(removeLink(all, skillId));

  if (isLoading) return <Skeleton height={160} />;
  if (isError) return <ErrorState body={t("skills.loadError")} onRetry={() => refetch()} />;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { enabled: countEnabledLinks(all), linked: all.length })}
        </Badge>
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            aria-label={t("skills.filterPlaceholder")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {all.length === 0 && <div style={s.muted}>{t("skills.empty")}</div>}
      {all.length > 0 && shown.length === 0 && (
        <div style={s.muted}>{t("skills.noMatch", { q: filter.trim() })}</div>
      )}
      <ul ref={listRef} style={s.list} aria-label={t("skills.title")}>
        {shown.map((l, index) => (
          // The row is only a drop target; the keyboard path is Alt+↑/↓ on the handle.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
          <li
            key={l.skill_id}
            data-row={l.skill_id}
            title={l.skill_enabled ? undefined : t("skills.offGloballyTitle")}
            style={s.row(dragFrom === index)}
            onDragOver={(e) => {
              if (dragFrom != null) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom != null) move(dragFrom, index);
              setDragFrom(null);
            }}
          >
            <button
              type="button"
              data-handle={l.skill_id}
              aria-label={t("skills.dragHandle", { name: l.name })}
              title={t("skills.dragHandle", { name: l.name })}
              aria-disabled={!reorderable}
              draggable={reorderable}
              onDragStart={(e) => {
                setDragFrom(index);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", l.skill_id);
                const row = e.currentTarget.closest("li");
                if (row) e.dataTransfer.setDragImage(row, 0, 0);
              }}
              onDragEnd={() => setDragFrom(null)}
              onKeyDown={(e) => {
                const delta = moveDelta(e.key, e.altKey);
                if (!delta || !reorderable) return;
                e.preventDefault();
                move(index, index + delta);
              }}
              style={s.handle(reorderable)}
            >
              <Icon.Menu size={15} />
            </button>
            <Checkbox
              checked={l.enabled}
              onChange={(v) => toggle(l.skill_id, v)}
              label={
                <span className="mono" style={s.name}>
                  {l.name}
                </span>
              }
            />
            {!l.skill_enabled && <Badge color="var(--text-muted)">{t("skills.offGlobally")}</Badge>}
            <span style={s.rowRight}>
              <SkillTypeBadge type={l.type} />
              <IconBtn icon="X" size={26} label={t("skills.detach", { name: l.name })} onClick={() => detach(l.skill_id)} />
            </span>
          </li>
        ))}
      </ul>

      <div style={s.attach}>
        {skills && skills.length === 0 ? (
          <span style={s.muted}>
            {t("skills.noWorkspaceSkills")}{" "}
            <Link href="/skills" style={s.link}>
              {t("skills.goToSkills")}
            </Link>
          </span>
        ) : (
          candidates.length > 0 && (
            <Dropdown
              width={ATTACH_MENU_WIDTH}
              trigger={
                <Button kind="secondary" size="sm" icon="Plus">
                  {t("skills.attach")}
                </Button>
              }
              items={candidates.map((sk) => ({ label: sk.name, icon: "Sparkles" as const, onClick: () => attach(sk) }))}
            />
          )
        )}
      </div>
    </div>
  );
}
