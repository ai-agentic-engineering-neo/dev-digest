/* Agent editor → Skills. Attach/detach, enable/disable, and reorder the skills
   whose markdown becomes the agent's prompt blocks.

   Order IS prompt order, so the attached skills form an ordered prefix of the
   list and reordering is offered only while the filter box is empty — dragging
   inside a filtered list has no well-defined target index. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, ErrorState, Icon, Skeleton, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agent-skills";
import { useToast } from "../../../../../../../lib/toast";
import { typeColor } from "../../../../../../skills/helpers";
import {
  buildRows,
  countEnabled,
  moveRow,
  reorderTo,
  toPayload,
  toggleAttached,
  toggleEnabled,
  type SkillRow,
} from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const { data: skills, isLoading: loadingSkills, isError, refetch } = useSkills();
  const { data: links, isLoading: loadingLinks } = useAgentSkills(agent.id);
  const save = useSetAgentSkills();

  // `draft` holds the user's in-progress edits. It starts null (no edits yet)
  // and stays null until the first edit, so a background refetch of `skills`
  // / `links` (e.g. another tab saving, a window refocus) recomputes `rows`
  // from the fresh server data without discarding an unsaved draft — the
  // draft is only ever replaced by a save, never by a refetch.
  const [draft, setDraft] = React.useState<SkillRow[] | null>(null);
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);

  const rows = draft ?? (skills && links ? buildRows(skills, links) : null);

  if (isError) return <ErrorState body={t("skills.loadError")} onRetry={() => refetch()} />;
  if (loadingSkills || loadingLinks || !rows) return <Skeleton height={180} />;

  const q = filter.trim().toLowerCase();
  const reorderable = q.length === 0;
  const visible = q
    ? rows.filter(
        (r) => r.skill.name.toLowerCase().includes(q) || r.skill.type.toLowerCase().includes(q),
      )
    : rows;

  const attachedCount = rows.filter((r) => r.attached).length;

  const commit = () => {
    save.mutate(
      { agentId: agent.id, skills: toPayload(rows) },
      {
        onSuccess: () => {
          // The saved draft is now what `links` will refetch to — drop it so
          // `rows` goes back to being derived from server data.
          setDraft(null);
          toast.success(t("skills.savedToast", { name: agent.name }));
        },
      },
    );
  };

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const attached = rows.filter((r) => r.attached);
    const toIndex = attached.findIndex((r) => r.skill.id === targetId);
    if (toIndex !== -1) setDraft(reorderTo(rows, dragId, toIndex));
    setDragId(null);
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent-text)">
          {t("skills.enabledCount", { linked: countEnabled(rows), total: rows.length })}
        </Badge>
        <div style={s.filter}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>
        {t("skills.orderHint")}
        {!reorderable && ` ${t("skills.reorderLockedHint")}`}
      </p>

      {visible.length === 0 && (
        <div style={s.empty}>{rows.length === 0 ? t("skills.noSkills") : t("skills.noMatches")}</div>
      )}

      <div style={s.list}>
        {visible.map((r) => {
          const index = rows.filter((x) => x.attached).findIndex((x) => x.skill.id === r.skill.id);
          const canDrag = reorderable && r.attached;
          return (
            <div
              key={r.skill.id}
              draggable={canDrag}
              onDragStart={() => canDrag && setDragId(r.skill.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => canDrag && e.preventDefault()}
              onDrop={() => canDrag && onDrop(r.skill.id)}
              style={s.row(r.attached, dragId === r.skill.id)}
            >
              <span style={s.handle(canDrag)} aria-hidden="true">
                <Icon.Menu size={14} />
              </span>

              {/* Attach / detach. */}
              <Toggle
                on={r.attached}
                onChange={() => setDraft(toggleAttached(rows, r.skill.id))}
                size={14}
              />

              <span className="mono" style={s.name}>
                {r.skill.name}
              </span>

              {/* The per-link mute, only meaningful once attached. */}
              {r.attached && (
                <Button
                  kind="ghost"
                  size="sm"
                  icon={r.enabled ? "Eye" : "EyeOff"}
                  onClick={() => setDraft(toggleEnabled(rows, r.skill.id))}
                  title={r.enabled ? undefined : t("skills.mutedTitle")}
                >
                  {r.enabled ? t("skills.mute") : t("skills.unmute")}
                </Button>
              )}

              <span className="mono" style={s.typeChip(typeColor(r.skill.type))}>
                {r.skill.type}
              </span>

              {canDrag && (
                <span style={s.moveGroup}>
                  <button
                    type="button"
                    onClick={() => setDraft(moveRow(rows, r.skill.id, -1))}
                    disabled={index === 0}
                    aria-label={t("skills.moveUp", { name: r.skill.name })}
                    style={s.moveBtn(index === 0)}
                  >
                    <Icon.ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft(moveRow(rows, r.skill.id, 1))}
                    disabled={index === attachedCount - 1}
                    aria-label={t("skills.moveDown", { name: r.skill.name })}
                    style={s.moveBtn(index === attachedCount - 1)}
                  >
                    <Icon.ArrowDown size={13} />
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={commit} disabled={save.isPending}>
          {save.isPending ? t("skills.saving") : t("skills.save")}
        </Button>
      </div>
    </div>
  );
}
