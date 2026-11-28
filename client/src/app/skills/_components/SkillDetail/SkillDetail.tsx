/* SkillDetail — one skill's header, six tabs and the unsaved draft. The draft
   lives here (the page keys this component by skill id), so switching tabs of
   the same skill keeps it; leaving the skill with unsaved edits asks first. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton, Tabs } from "@devdigest/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SkillTypeBadge, SkillTypeIcon } from "@/components/skill-type";
import { useSkill } from "@/lib/hooks/skills";
import { VALID_TABS, type SkillTab } from "../../constants";
import { parseTab, toDraft, type SkillDraft } from "../../helpers";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersionsTab } from "./_components/VersionsTab";
import { FutureTabEmpty } from "./_components/FutureTabEmpty";
import { FUTURE_TABS } from "./constants";
import { isDirty, isNotFound } from "./helpers";
import { useUnsavedGuard } from "./useUnsavedGuard";
import { s } from "./styles";

export function SkillDetail({ id, tab, onTab }: { id: string; tab: SkillTab; onTab: (tab: SkillTab) => void }) {
  const t = useTranslations("skills");
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const [draft, setDraft] = React.useState<SkillDraft | null>(null);
  const saved = skill ? toDraft(skill) : null;
  const current = draft ?? saved;
  const dirty = !!saved && !!draft && isDirty(saved, draft);
  const guard = useUnsavedGuard(dirty, () => setDraft(null));

  if (isLoading) {
    return (
      <div style={s.loading}>
        <Skeleton height={24} width={240} />
        <Skeleton height={200} />
      </div>
    );
  }
  if (isError || !skill || !current) {
    if (isNotFound(error)) {
      return (
        <div style={s.notFound}>
          <EmptyState icon="Sparkles" title={t("detail.notFound.title")} body={t("detail.notFound.body")} />
          <Link href="/skills" style={s.backLink}>
            {t("detail.notFound.back")}
          </Link>
        </div>
      );
    }
    return <ErrorState body={t("detail.loadError")} onRetry={() => refetch()} />;
  }

  const tabs = VALID_TABS.map((k) => ({ key: k, label: t(`tabs.${k}`) }));
  const future = FUTURE_TABS[tab];
  const edit = (patch: Partial<SkillDraft>) => setDraft({ ...current, ...patch });

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <SkillTypeIcon type={skill.type} size={28} />
        <h1 className="mono" style={s.h1}>
          {skill.name}
        </h1>
        <SkillTypeBadge type={skill.type} />
        <Badge icon="GitCommit" mono>
          {t("detail.version", { version: skill.version })}
        </Badge>
        {/* A disabled button fires no hover events, so the span carries the hint. */}
        <span style={s.headerRight} title={t("detail.runOnEvalsHint")}>
          <Button kind="secondary" size="sm" icon="Play" disabled>
            {t("detail.runOnEvals")}
          </Button>
        </span>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={(k) => onTab(parseTab(k))} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "config" && (
          <ConfigTab
            skill={skill}
            draft={current}
            dirty={dirty}
            onChange={edit}
            onDiscard={() => setDraft(null)}
            onSaved={() => setDraft(null)}
          />
        )}
        {tab === "preview" && <PreviewTab draft={current} dirty={dirty} />}
        {tab === "versions" && <VersionsTab skill={skill} dirty={dirty} onRestored={() => setDraft(null)} />}
        {future && <FutureTabEmpty icon={future.icon} messageKey={future.messageKey} />}
      </div>
      {guard.pendingHref && (
        <ConfirmDialog
          title={t("detail.unsaved.title")}
          message={t("detail.unsaved.body", { name: skill.name })}
          confirmLabel={t("detail.unsaved.confirm")}
          onConfirm={guard.confirm}
          onCancel={guard.cancel}
        />
      )}
    </div>
  );
}
