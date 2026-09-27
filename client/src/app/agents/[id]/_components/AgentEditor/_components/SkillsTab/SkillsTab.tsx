/* SkillsTab — which skills this agent loads, and in what order.
   Order is not cosmetic: it is the order of the blocks in the assembled prompt,
   so the row position is the thing being edited. Rows are draggable AND carry
   ↑/↓ buttons — dragging is the fast path, the buttons are the keyboard path
   (and the one a test can exercise). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Skeleton, Toggle, type IconName } from "@devdigest/ui";
import type { Agent, Skill } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills } from "@/lib/hooks/agents";
import { useSkills } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { orderedSkills, move, toggleSkill } from "./helpers";
import { s } from "./styles";

/** A square icon button that can be disabled — `IconBtn` cannot. */
function OrderButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const I = Icon[icon];
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={s.orderBtn(!!disabled)}
    >
      <I size={13} />
    </button>
  );
}

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const tSkills = useTranslations("skills");
  const toast = useToast();
  const { data: all, isLoading } = useSkills();
  const { data: links, isPending: linksPending } = useAgentSkills(agent.id);
  const save = useSetAgentSkills();
  const [filter, setFilter] = React.useState("");

  // The server is the source of truth; `pending` is only an optimistic override
  // while a save is in flight. Copying `links` into state and re-syncing it with
  // an effect is what made a click BEFORE the links arrived send a one-element
  // array to a full-replace endpoint — wiping every other link.
  const [pending, setPending] = React.useState<string[] | null>(null);
  const [dragging, setDragging] = React.useState<string | null>(null);

  const linked = React.useMemo(() => links?.map((l) => l.skill_id) ?? [], [links]);
  const selected = pending ?? linked;

  const commit = (ids: string[]) => {
    setPending(ids);
    save.mutate(
      { agentId: agent.id, skillIds: ids },
      {
        // A failed save must not leave the UI claiming the change stuck: drop
        // the override so the rows snap back to what the server actually holds.
        onError: () => {
          setPending(null);
          toast.error(t("skills.saveFailed"));
        },
      },
    );
  };

  const rows = orderedSkills(all ?? [], selected, filter);

  const onDrop = (targetId: string) => {
    if (!dragging || dragging === targetId) return;
    const from = selected.indexOf(dragging);
    const to = selected.indexOf(targetId);
    setDragging(null);
    if (from < 0 || to < 0) return;
    commit(move(selected, from, to));
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: selected.length, total: (all ?? []).length })}
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
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {/* Nothing is clickable until the links are known: the endpoint replaces
          the whole set, so acting on an empty list would unlink everything. */}
      {(isLoading || linksPending) && <Skeleton height={44} />}
      {!isLoading && !linksPending && rows.length === 0 && (
        <p style={s.empty}>{t("skills.empty")}</p>
      )}

      {!linksPending && rows.map((skill: Skill) => {
        const index = selected.indexOf(skill.id);
        const linked = index >= 0;
        return (
          <div
            key={skill.id}
            draggable={linked}
            onDragStart={() => setDragging(skill.id)}
            onDragOver={(e) => linked && e.preventDefault()}
            onDrop={() => onDrop(skill.id)}
            style={s.row(linked)}
          >
            <span style={s.handle(linked)} aria-hidden>
              <Icon.Menu size={13} />
            </span>
            {/* On = this agent loads the skill, in the position shown on the
                right. Off = not in this agent's prompt at all. */}
            <Toggle
              on={linked}
              onChange={() => commit(toggleSkill(selected, skill.id))}
              size={14}
              label={t("skills.toggleLabel", { name: skill.name })}
            />
            <span className="mono" style={s.name}>
              {skill.name}
            </span>
            {!skill.enabled && (
              <Badge color="var(--text-muted)">{tSkills("listItem.disabled")}</Badge>
            )}
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <Badge color="var(--text-muted)">{tSkills(`listItem.type.${skill.type}`)}</Badge>
              {linked && (
                <>
                  <span style={s.position}>#{index + 1}</span>
                  <OrderButton
                    icon="ArrowUp"
                    label={t("skills.moveUp", { name: skill.name })}
                    disabled={index === 0}
                    onClick={() => commit(move(selected, index, index - 1))}
                  />
                  <OrderButton
                    icon="ArrowDown"
                    label={t("skills.moveDown", { name: skill.name })}
                    disabled={index === selected.length - 1}
                    onClick={() => commit(move(selected, index, index + 1))}
                  />
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
