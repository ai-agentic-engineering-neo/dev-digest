"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersionDiff, useSkillVersions } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { ConfirmDialog } from "../../../../../../../components/confirm-dialog";
import { formatDateTime } from "../../../../../../../lib/format-date";
import { PatchView } from "../PatchView";
import { s } from "../../styles";

/** One row of the history: version badge, date, Diff toggle, Restore (previous versions only). */
function VersionRow({ skill, version, createdAt }: { skill: Skill; version: number; createdAt: string }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const [showDiff, setShowDiff] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const isCurrent = version === skill.version;
  const diff = useSkillVersionDiff(skill.id, showDiff ? version : null);
  const restore = useRestoreSkillVersion();

  const doRestore = () =>
    restore.mutate(
      { id: skill.id, version },
      {
        onSuccess: (data) => {
          setConfirming(false);
          setShowDiff(false);
          toast.success(t("editor.versioning.restoredToast", { from: version, to: data.version }));
        },
      },
    );

  return (
    <div style={s.versionRow} role="listitem" data-testid="skill-version-row">
      {confirming && (
        <ConfirmDialog
          title={t("editor.versioning.confirmTitle", { version })}
          body={t("editor.versioning.confirmBody", { current: skill.version })}
          confirmLabel={t("editor.versioning.confirm")}
          cancelLabel={t("editor.versioning.cancel")}
          danger={false}
          pending={restore.isPending}
          onConfirm={doRestore}
          onCancel={() => setConfirming(false)}
        />
      )}
      <div style={s.versionHead}>
        <Badge mono color={isCurrent ? "var(--accent)" : "var(--text-secondary)"}>
          {t("editor.versioning.version", { version })}
        </Badge>
        {isCurrent && <Badge color="var(--ok)">{t("editor.versioning.current")}</Badge>}
        <span style={s.versionDate}>{formatDateTime(createdAt)}</span>
        <span style={s.versionSpacer} />
        {!isCurrent && (
          <>
            <Button kind="secondary" size="sm" icon="GitCommit" onClick={() => setShowDiff((v) => !v)}>
              {showDiff ? t("editor.versioning.hideDiff") : t("editor.versioning.diff")}
            </Button>
            <Button kind="secondary" size="sm" icon="RefreshCw" onClick={() => setConfirming(true)} disabled={restore.isPending}>
              {restore.isPending ? t("editor.versioning.restoring") : t("editor.versioning.restore")}
            </Button>
          </>
        )}
      </div>
      {showDiff && (
        <div style={s.diffBox}>
          {diff.isLoading && <Skeleton height={60} />}
          {diff.data && (
            <>
              <div style={s.diffSummary}>
                {diff.data.additions === 0 && diff.data.deletions === 0
                  ? t("editor.versioning.noChanges")
                  : t("editor.versioning.diffSummary", {
                      additions: diff.data.additions,
                      deletions: diff.data.deletions,
                      to: diff.data.to_version,
                    })}
              </div>
              {(diff.data.additions > 0 || diff.data.deletions > 0) && <PatchView patch={diff.data.patch} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Versioning tab — every body snapshot, newest first, with Diff and Restore. */
export function VersioningTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: versions, isLoading } = useSkillVersions(skill.id);
  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("editor.versioning.title")}</h2>
      <div style={s.hint}>{t("editor.versioning.hint")}</div>
      {isLoading && (
        <div style={s.versionList}>
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      )}
      {versions && versions.length === 0 && <EmptyState icon="History" title={t("editor.versioning.empty")} />}
      {versions && versions.length > 0 && (
        <div style={s.versionList} role="list">
          {versions.map((v) => (
            <VersionRow key={v.version} skill={skill} version={v.version} createdAt={v.created_at} />
          ))}
        </div>
      )}
    </div>
  );
}
