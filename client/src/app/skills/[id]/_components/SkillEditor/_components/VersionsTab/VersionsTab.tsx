/* VersionsTab — version history rows (newest first): vN badge, change note,
   date, and — for every row except the current version — Diff (plain
   old-vs-current text, no diff algorithm) + Restore. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "../../../../../../../lib/hooks/skills";
import { formatWhen } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion(skill.id);
  const [diffing, setDiffing] = React.useState<SkillVersion | null>(null);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={52} style={{ marginBottom: 8 }} />
        <Skeleton height={52} style={{ marginBottom: 8 }} />
        <Skeleton height={52} />
      </div>
    );
  }
  if (isError) {
    return <ErrorState body={t("versionsTab.loadError")} onRetry={() => refetch()} />;
  }
  const list = versions ?? [];
  if (list.length === 0) {
    return <EmptyState icon="History" title={t("versionsTab.empty")} />;
  }

  return (
    <div style={s.wrap}>
      {list.map((v) => {
        const isCurrent = v.version === skill.version;
        return (
          <div key={v.version} style={s.row}>
            <Badge color="var(--text-secondary)" mono>
              {t("preview.version", { version: v.version })}
            </Badge>
            <span style={s.note}>{v.change_note || t("versionsTab.noChangeNote")}</span>
            <span style={s.when}>{formatWhen(v.created_at)}</span>
            {isCurrent ? (
              <Badge color="var(--ok)">{t("versionsTab.current")}</Badge>
            ) : (
              <div style={s.actions}>
                <Button kind="secondary" size="sm" icon="Eye" onClick={() => setDiffing(v)}>
                  {t("versionsTab.diff")}
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  icon="History"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(v.version)}
                >
                  {restore.isPending ? t("versionsTab.restoring") : t("versionsTab.restore")}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {diffing && (
        <Modal
          width={860}
          title={t("versionsTab.diffModalTitle", { from: diffing.version, to: skill.version })}
          onClose={() => setDiffing(null)}
        >
          <div style={s.diffGrid}>
            <div style={s.diffCol}>
              <div style={s.diffLabel}>{t("versionsTab.diffOld", { version: diffing.version })}</div>
              <pre style={s.diffPre}>{diffing.body}</pre>
            </div>
            <div style={s.diffCol}>
              <div style={s.diffLabel}>{t("versionsTab.diffCurrent", { version: skill.version })}</div>
              <pre style={s.diffPre}>{skill.body}</pre>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
