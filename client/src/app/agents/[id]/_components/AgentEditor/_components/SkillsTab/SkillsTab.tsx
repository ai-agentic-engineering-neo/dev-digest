"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge, Button, EmptyState, ErrorState, Icon, Skeleton, TextInput } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills } from "@/lib/hooks/agents";
import { useSkills } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { AvailableSkillRow } from "./AvailableSkillRow";
import { DRAG_ACTIVATION_DISTANCE, LOADING_ROWS } from "./constants";
import {
  blockedIds,
  buildRows,
  countLinked,
  filterRows,
  groupRows,
  reorder,
  sameIds,
  syncRows,
  toSkillIds,
  toggleRow,
  unlinkRows,
  type SkillRow,
} from "./helpers";
import { SortableSkillRow } from "./SortableSkillRow";
import { s } from "./styles";

/**
 * Skills tab — link/unlink catalog skills to the agent and order them (the order
 * is the order skill bodies appear in the assembled prompt). Edits stay local
 * until "Save skills"; `edits === null` means "show what the server has".
 */
export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const toast = useToast();
  const skillsQuery = useSkills();
  const linksQuery = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills(agent.id);
  const [edits, setEdits] = React.useState<SkillRow[] | null>(null);
  const [query, setQuery] = React.useState("");

  const sensors = useSensors(
    // Drag only starts after a few px of movement so plain clicks stay clicks.
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (skillsQuery.isError || linksQuery.isError) {
    return (
      <div style={s.wrap}>
        <ErrorState
          title={t("skills.loadErrorTitle")}
          body={t("skills.loadErrorBody")}
          onRetry={() => {
            skillsQuery.refetch();
            linksQuery.refetch();
          }}
        />
      </div>
    );
  }
  if (!skillsQuery.data || !linksQuery.data) {
    return (
      <div style={{ ...s.wrap, ...s.loading }} aria-busy="true">
        <Skeleton height={24} width={200} />
        {Array.from({ length: LOADING_ROWS }, (_, i) => (
          <Skeleton key={i} height={42} />
        ))}
      </div>
    );
  }
  if (skillsQuery.data.length === 0) {
    return (
      <div style={s.wrap}>
        <EmptyState
          icon="Sparkles"
          title={t("skills.emptyTitle")}
          body={t("skills.emptyBody")}
          cta={t("skills.emptyCta")}
          onCta={() => router.push("/skills")}
        />
      </div>
    );
  }

  const saved = buildRows(skillsQuery.data, linksQuery.data);
  const rows = edits ? syncRows(edits, skillsQuery.data) : saved;
  const dirty = !sameIds(toSkillIds(rows), toSkillIds(saved));
  const { enabled, available } = groupRows(filterRows(rows, query));
  const filtering = query.trim() !== "";
  const onToggle = (id: string) => setEdits(toggleRow(rows, id));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) setEdits(reorder(rows, String(active.id), String(over.id)));
  };

  const save = () =>
    setSkills.mutate(toSkillIds(rows), {
      // The failure toast comes from the global mutation error handler and carries the server
      // message (422 SKILL_BLOCKED: "Cannot link a skill with detected prompt injection").
      onSuccess: (links) => {
        setEdits(null);
        toast.success(t("skills.savedToast", { count: links.length }));
      },
      onError: (err) => {
        if (!(err instanceof ApiError) || err.code !== "SKILL_BLOCKED") return;
        // Flagged after this tab loaded: drop it from the pending selection and refresh the
        // catalog so its row shows the injection state.
        setEdits(unlinkRows(rows, blockedIds(err.details)));
        skillsQuery.refetch();
      },
    });

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: countLinked(rows), total: rows.length })}
        </Badge>
        <div style={s.filter}>
          <TextInput
            value={query}
            onChange={setQuery}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            suffix={<Icon.Search size={14} style={{ color: "var(--text-muted)" }} />}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {/* Enabled: linked skills, sortable — this order is the prompt order. */}
      {(enabled.length > 0 || !filtering) && (
        <section style={s.group} aria-label={t("skills.groups.enabled")}>
          <h3 style={s.groupTitle}>{t("skills.groups.enabled")}</h3>
          {enabled.length === 0 ? (
            <div style={s.groupEmpty}>{t("skills.groups.enabledEmpty")}</div>
          ) : (
            <DndContext id={`agent-skills-${agent.id}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={enabled.map((r) => r.skill.id)} strategy={verticalListSortingStrategy}>
                <div style={s.list}>
                  {enabled.map((row) => (
                    <SortableSkillRow key={row.skill.id} row={row} dragDisabled={filtering} onToggle={onToggle} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </section>
      )}

      {/* Available: not linked — no drag handle, order is irrelevant. */}
      {available.length > 0 && (
        <section style={s.group} aria-label={t("skills.groups.available")}>
          <h3 style={s.groupTitle}>{t("skills.groups.available")}</h3>
          <div style={s.list}>
            {available.map((row) => (
              <AvailableSkillRow key={row.skill.id} row={row} onToggle={onToggle} />
            ))}
          </div>
        </section>
      )}
      {enabled.length + available.length === 0 &&<div style={s.noMatch}>{t("skills.noMatch", { query: query.trim() })}</div>}

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={!dirty || setSkills.isPending}>
          {setSkills.isPending ? t("skills.saving") : t("skills.save")}
        </Button>
      </div>
    </div>
  );
}
