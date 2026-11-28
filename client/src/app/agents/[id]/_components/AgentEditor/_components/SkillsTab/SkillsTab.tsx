/* SkillsTab — attach / enable / order the skills that go into this agent's
   system prompt. Lists every workspace skill: checked = in the prompt; order
   (drag the handle, or ↑/↓ for keyboard) = order of the `### Skill:` blocks.
   Saved as one batch (PUT /agents/:id/skills). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, EmptyState, ErrorState, Icon, Skeleton, TextInput } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SkillSourceTag, SkillTypeBadge } from "@/components/skill-badges";
import { buildRows, matches, move, sameRows, toInput, type SkillRow } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const all = useSkills();
  const links = useAgentSkills(agent.id);

  if (all.isLoading || links.isLoading) return <Skeleton height={240} />;
  if (all.isError || links.isError || !all.data || !links.data) {
    return (
      <ErrorState
        title={t("agentTab.loadError")}
        onRetry={() => {
          void all.refetch();
          void links.refetch();
        }}
      />
    );
  }
  if (all.data.length === 0) {
    return (
      <EmptyState
        icon="Sparkles"
        title={t("agentTab.empty")}
        cta={t("agentTab.emptyCta")}
        onCta={() => router.push("/skills")}
      />
    );
  }
  const initial = buildRows(all.data, links.data);
  // Keyed on the server state: a save / refetch remounts the editor with fresh
  // rows instead of syncing props into state.
  const key = `${agent.id}:${initial.map((r) => `${r.skillId}${r.enabled ? 1 : 0}`).join(",")}`;
  return <SkillsEditor key={key} agentId={agent.id} initial={initial} />;
}

function SkillsEditor({ agentId, initial }: { agentId: string; initial: SkillRow[] }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const save = useSetAgentSkills();
  const [rows, setRows] = React.useState(initial);
  const [filter, setFilter] = React.useState("");
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState<number | null>(null);

  const reorderable = filter.trim() === "";
  const enabledCount = rows.filter((r) => r.enabled).length;
  const dirty = !sameRows(rows, initial);

  const toggle = (idx: number, enabled: boolean) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, enabled } : r)));

  const onDrop = (to: number) => {
    if (dragFrom != null) setRows((rs) => move(rs, dragFrom, to));
    setDragFrom(null);
    setDragOver(null);
  };

  const submit = () =>
    save.mutate(
      { agentId, input: toInput(rows) },
      { onSuccess: () => toast.success(t("agentTab.savedToast")) },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("agentTab.title")}</h2>
        <span className="tnum" style={s.count}>
          {t("agentTab.enabledCount", { enabled: enabledCount, total: rows.length })}
        </span>
        <div style={s.filter}>
          <TextInput value={filter} onChange={setFilter} placeholder={t("agentTab.filter")} />
        </div>
      </div>
      <p style={s.hint}>{t("agentTab.hint")}</p>
      <ol style={{ ...s.list, listStyle: "none", padding: 0, margin: 0 }} aria-label={t("agentTab.title")}>
        {rows.map((r, i) =>
          matches(r, filter) ? (
            <li
              key={r.skillId}
              data-testid={`agent-skill-row-${r.name}`}
              draggable={reorderable}
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragFrom == null) return;
                e.preventDefault();
                setDragOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(i);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
              style={s.row(dragFrom === i, dragOver === i && dragFrom !== i)}
            >
              <span style={s.handle(reorderable)} aria-label={t("agentTab.dragHandle", { name: r.name })}>
                <Icon.Menu size={14} />
              </span>
              <Checkbox checked={r.enabled} onChange={(v) => toggle(i, v)} />
              <span className="mono" style={s.name}>
                {r.name}
              </span>
              {!r.skillEnabled && (
                <span style={s.off} title={t("agentTab.globallyOffTitle")}>
                  {t("agentTab.globallyOff")}
                </span>
              )}
              <SkillSourceTag source={r.source} />
              <SkillTypeBadge type={r.type} />
              <span style={s.arrows}>
                <button
                  type="button"
                  style={s.arrowBtn}
                  disabled={!reorderable || i === 0}
                  aria-label={t("agentTab.moveUp", { name: r.name })}
                  onClick={() => setRows((rs) => move(rs, i, i - 1))}
                >
                  <Icon.ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  style={s.arrowBtn}
                  disabled={!reorderable || i === rows.length - 1}
                  aria-label={t("agentTab.moveDown", { name: r.name })}
                  onClick={() => setRows((rs) => move(rs, i, i + 1))}
                >
                  <Icon.ArrowDown size={13} />
                </button>
              </span>
            </li>
          ) : null,
        )}
      </ol>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={submit} disabled={!dirty || save.isPending}>
          {save.isPending ? t("agentTab.saving") : t("agentTab.save")}
        </Button>
        <Button kind="ghost" onClick={() => setRows(initial)} disabled={!dirty}>
          {t("agentTab.cancel")}
        </Button>
      </div>
    </div>
  );
}
