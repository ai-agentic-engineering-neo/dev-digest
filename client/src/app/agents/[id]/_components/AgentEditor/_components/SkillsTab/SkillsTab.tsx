/* SkillsTab — attach workspace skills to this agent and set their order.
   Order = order of the blocks under "## Skills / rules" in the prompt. A skill
   disabled on the Skills page stays attached but is not sent. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkillLinks, useSetAgentSkills, useSkills } from "../../../../../../../lib/hooks/skills";
import { SkillTypeChip } from "../../../../../../../components/skill-type-chip";
import { attachedIds, matchesFilter, moveBefore, orderSkills, toggleAttached } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const skillsQ = useSkills();
  const linksQ = useAgentSkillLinks(agent.id);
  const setSkills = useSetAgentSkills(agent.id);
  const [attached, setAttached] = React.useState<string[]>([]);
  const [filter, setFilter] = React.useState("");
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<string | null>(null);

  // Server state → local order (also after each save round-trip).
  React.useEffect(() => {
    if (linksQ.data) setAttached(attachedIds(linksQ.data));
  }, [linksQ.data]);

  const persist = (next: string[]) => {
    const prev = attached;
    setAttached(next);
    setSkills.mutate(next, { onError: () => setAttached(prev) });
  };

  if (skillsQ.isLoading || linksQ.isLoading) return <Skeleton height={200} />;
  if (skillsQ.isError || linksQ.isError) {
    return <ErrorState body={t("skills.loadError")} onRetry={() => (skillsQ.refetch(), linksQ.refetch())} />;
  }
  const all = skillsQ.data ?? [];
  if (all.length === 0) {
    return (
      <EmptyState
        icon="Sparkles"
        title={t("skills.empty.title")}
        body={t("skills.empty.body")}
        cta={t("skills.empty.cta")}
        onCta={() => router.push("/skills")}
      />
    );
  }

  const rows = orderSkills(all, attached).filter((sk) => matchesFilter(sk, filter));
  const isAttached = (id: string) => attached.includes(id);

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: attached.length, total: all.length })}
        </Badge>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("skills.filterPlaceholder")}
          style={s.filter}
        />
      </div>
      <div style={s.hint}>{t("skills.orderHint")}</div>

      {rows.length === 0 && <div style={s.muted}>{t("skills.noMatch")}</div>}
      {rows.map((sk) => {
        const on = isAttached(sk.id);
        return (
          <div
            key={sk.id}
            data-testid="agent-skill-row"
            draggable={on}
            onDragStart={(e) => {
              setDragging(sk.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!dragging || !on) return;
              e.preventDefault();
              setOver(sk.id);
            }}
            onDragLeave={() => setOver((o) => (o === sk.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging && on) persist(moveBefore(attached, dragging, sk.id));
              setDragging(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            style={s.row(on, over === sk.id && dragging !== sk.id)}
          >
            <span title={on ? t("skills.dragHandle") : undefined} style={s.grip(on)}>
              <Icon.GripVertical size={14} />
            </span>
            <Checkbox checked={on} onChange={(v) => persist(toggleAttached(attached, sk.id, v))} />
            <span className="mono" style={s.name}>
              {sk.name}
            </span>
            {!sk.enabled && (
              <span title={t("skills.disabledGloballyTitle")}>
                <Badge color="var(--text-muted)">{t("skills.disabledGlobally")}</Badge>
              </span>
            )}
            <SkillTypeChip type={sk.type} />
          </div>
        );
      })}
    </div>
  );
}
