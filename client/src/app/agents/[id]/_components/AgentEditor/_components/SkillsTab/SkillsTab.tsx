"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, Skeleton, TextInput } from "@devdigest/ui";
import { SkillRow } from "./_components/SkillRow";
import { SKELETON_ROWS, SKILLS_ROUTE } from "./constants";
import { useSkillsTab } from "./useSkillsTab";
import { s } from "./styles";

/** Agent Editor → Skills tab: attach workspace skills to the agent and order them (SPEC §3.2, §5.7). */
export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const hintId = React.useId();
  const tab = useSkillsTab(agentId);

  if (tab.isLoading) {
    return (
      <div style={s.wrap} aria-busy="true">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <Skeleton key={i} height={44} style={s.skeleton} />
        ))}
      </div>
    );
  }
  if (tab.isError) return <ErrorState body={t("skills.loadError")} onRetry={tab.retry} />;
  if (tab.total === 0) {
    return (
      <EmptyState
        icon="Sparkles"
        title={t("skills.empty.title")}
        body={
          <>
            {t("skills.empty.body")}{" "}
            <Link href={SKILLS_ROUTE} style={s.link}>
              {t("skills.empty.link")}
            </Link>
          </>
        }
      />
    );
  }

  return (
    <section style={s.wrap} aria-labelledby={`${hintId}-title`}>
      <div style={s.header}>
        <h2 id={`${hintId}-title`} style={s.h2}>
          {t("skills.title")}
        </h2>
        <Badge color="var(--accent)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: tab.attachedCount, total: tab.total })}
        </Badge>
      </div>
      <TextInput
        value={tab.query}
        onChange={tab.setQuery}
        placeholder={t("skills.filterPlaceholder")}
        aria-label={t("skills.filterLabel")}
        suffix={<Icon.Search size={13} style={s.searchIcon} />}
      />
      <p id={hintId} style={s.hint}>
        {t("skills.orderHint")} {tab.canReorder ? t("skills.keyboardHint") : t("skills.dragDisabled")}
      </p>
      {tab.visibleRows.length === 0 ? (
        <p style={s.noMatches}>{t("skills.noMatches", { query: tab.query.trim() })}</p>
      ) : (
        <ul style={s.list} aria-label={t("skills.listLabel")}>
          {tab.visibleRows.map((row) => (
            <SkillRow
              key={row.skill.id}
              row={row}
              reorderable={tab.canReorder}
              hintId={hintId}
              rowRef={tab.focusRowRef(row)}
              onToggle={() => tab.handleToggle(row.skill.id)}
              onMove={(delta) => tab.handleMove(row, delta)}
              dnd={{
                active: tab.dragId !== null,
                isDragging: tab.dragId === row.skill.id,
                onStart: () => tab.setDragId(row.skill.id),
                onEnd: () => tab.setDragId(null),
                onDrop: () => tab.handleDrop(row),
              }}
            />
          ))}
        </ul>
      )}
      <div role="status" aria-live="polite" style={s.srOnly}>
        {tab.announcement}
      </div>
    </section>
  );
}
