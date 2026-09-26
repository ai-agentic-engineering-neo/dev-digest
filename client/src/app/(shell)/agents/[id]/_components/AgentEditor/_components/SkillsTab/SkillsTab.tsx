"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useAgentSkills, useSetAgentSkills } from "@/lib/hooks/skills";
import { TYPE_COLOR, TYPE_ICON } from "@/lib/skill-display";
import { filterItems, moveLinked, reorderLinked, toggleLinked } from "./helpers";
import { s } from "./styles";

/**
 * Agent editor Skills tab — GET/PUT /agents/:id/skills. Every checkbox toggle
 * or reorder immediately PUTs the full ordered (linked) list, optimistically
 * (useSetAgentSkills), so the row order updates before the request lands.
 */
export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  // Skill type labels ("rubric", "security", ...) are owned by the Skills
  // feature's i18n namespace — reused here rather than duplicated.
  const st = useTranslations("skills");
  const { data: items, isLoading, isError, refetch } = useAgentSkills(agentId);
  const setSkills = useSetAgentSkills(agentId);
  const [search, setSearch] = React.useState("");
  const [dragOverId, setDragOverId] = React.useState<string | null>(null);

  if (isLoading || !items) {
    return (
      <div style={s.wrap}>
        <Skeleton height={40} />
        <Skeleton height={40} style={{ marginTop: 8 }} />
      </div>
    );
  }
  if (isError) {
    return <ErrorState body={t("skills.loadError")} onRetry={() => refetch()} />;
  }

  const linkedCount = items.filter((i) => i.linked && i.enabled).length;
  const visible = filterItems(items, search);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span>{t("skills.enabledCount", { linked: linkedCount, total: items.length })}</span>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>
      <div style={s.search}>
        <Icon.Search size={13} style={s.searchIcon} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("skills.filterPlaceholder")}
          style={s.searchInput}
        />
      </div>

      {visible.length === 0 ? (
        <div style={s.hint}>{t("skills.empty")}</div>
      ) : (
        <div style={s.list}>
          {visible.map((it) => {
            const TypeIcon = Icon[TYPE_ICON[it.type]];
            const typeColor = TYPE_COLOR[it.type];
            return (
              <div
                key={it.id}
                style={s.row(dragOverId === it.id)}
                draggable={it.linked}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", it.id)}
                onDragOver={(e) => {
                  if (!it.linked) return;
                  e.preventDefault();
                  setDragOverId(it.id);
                }}
                onDragLeave={() => setDragOverId((id) => (id === it.id ? null : id))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverId(null);
                  const fromId = e.dataTransfer.getData("text/plain");
                  if (fromId && fromId !== it.id) setSkills.mutate(reorderLinked(items, fromId, it.id));
                }}
              >
                {it.linked ? (
                  <span
                    style={s.dragHandle}
                    title={t("skills.dragHandle")}
                    aria-label={t("skills.dragHandle")}
                  >
                    <Icon.Menu size={13} />
                  </span>
                ) : (
                  <span style={{ width: 13 }} />
                )}
                <Checkbox
                  checked={it.linked}
                  onChange={(checked) => setSkills.mutate(toggleLinked(items, it.id, checked))}
                />
                <TypeIcon size={14} style={{ color: typeColor, flexShrink: 0 }} />
                <span style={s.name}>{it.name}</span>
                <span style={s.description}>{it.description}</span>
                <Badge color={typeColor} bg={typeColor + "1a"}>
                  {st(`listItem.type.${it.type}`)}
                </Badge>
                {it.linked && (
                  <div style={s.reorderBtns}>
                    <button
                      type="button"
                      style={s.reorderBtn}
                      aria-label={t("skills.moveUp")}
                      title={t("skills.moveUp")}
                      onClick={() => setSkills.mutate(moveLinked(items, it.id, -1))}
                    >
                      <Icon.ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      style={s.reorderBtn}
                      aria-label={t("skills.moveDown")}
                      title={t("skills.moveDown")}
                      onClick={() => setSkills.mutate(moveLinked(items, it.id, 1))}
                    >
                      <Icon.ArrowDown size={13} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
