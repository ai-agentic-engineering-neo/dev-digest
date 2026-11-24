/* VersioningTab — body history of a skill (newest first). Every earlier version
   can be diffed against the current body or restored (appended as a new version). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { DiffModal } from "../DiffModal";
import { s } from "./styles";

export function VersioningTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion(skill.id);
  const [diffing, setDiffing] = React.useState<SkillVersion | null>(null);
  const [busy, setBusy] = React.useState<number | null>(null);

  const onRestore = (v: SkillVersion) => {
    if (!window.confirm(t("versions.restoreConfirm", { version: v.version }))) return;
    setBusy(v.version);
    restore.mutate(v.version, {
      onSuccess: (data) =>
        toast.success(
          data.version === skill.version
            ? t("versions.restoredNoop", { version: v.version })
            : t("versions.restoredToast", { from: v.version, to: data.version }),
        ),
      onSettled: () => setBusy(null),
    });
  };

  if (isLoading) return <Skeleton height={120} />;
  if (isError) return <ErrorState title={t("versions.loadError")} onRetry={() => refetch()} />;

  return (
    <div>
      <p style={s.hint}>{t("versions.hint")}</p>
      {!versions || versions.length === 0 ? (
        <div style={s.message}>{t("versions.empty")}</div>
      ) : (
        <ul style={s.list} aria-label={t("versions.title")}>
          {versions.map((v) => {
            const isCurrent = v.version === skill.version;
            return (
              <li key={v.version} style={s.row} data-testid={`version-${v.version}`}>
                <span className="mono" style={s.version}>
                  {t("versions.version", { version: v.version })}
                </span>
                {isCurrent && <Badge color="var(--ok)">{t("versions.current")}</Badge>}
                <span style={s.date}>{new Date(v.created_at).toLocaleString()}</span>
                {!isCurrent && (
                  <div style={s.actions}>
                    <Button
                      kind="secondary"
                      size="sm"
                      icon="Code"
                      aria-label={t("versions.diffAria", { version: v.version })}
                      onClick={() => setDiffing(v)}
                    >
                      {t("versions.diff")}
                    </Button>
                    <Button
                      kind="secondary"
                      size="sm"
                      icon="History"
                      aria-label={t("versions.restoreAria", { version: v.version })}
                      loading={busy === v.version}
                      disabled={restore.isPending}
                      onClick={() => onRestore(v)}
                    >
                      {busy === v.version ? t("versions.restoring") : t("versions.restore")}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {diffing && (
        <DiffModal
          version={diffing.version}
          current={skill.version}
          oldBody={diffing.body}
          newBody={skill.body}
          onClose={() => setDiffing(null)}
        />
      )}
    </div>
  );
}
