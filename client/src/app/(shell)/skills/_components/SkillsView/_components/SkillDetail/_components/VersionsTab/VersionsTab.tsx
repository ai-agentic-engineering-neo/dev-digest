"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions, useRestoreSkillVersion } from "@/lib/hooks/skills";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/lib/toast";
import { VersionDiffModal } from "./_components/VersionDiffModal";
import { s } from "./styles";

/** Version history — one row per SkillVersion, newest first (as returned).
   Every non-current row gets a Diff (against the CURRENT body) and a Restore
   action; Restore is gated behind useConfirm(), never fires without it. */
export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion(skill.id);
  const { confirm, dialog } = useConfirm();
  const [diffVersion, setDiffVersion] = React.useState<number | null>(null);

  if (isLoading || !versions) {
    return (
      <div style={s.wrap}>
        <Skeleton height={48} />
        <Skeleton height={48} style={{ marginTop: 8 }} />
      </div>
    );
  }
  if (isError) {
    return <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.heading")}</h2>
        <span style={s.count}>{t("versions.count", { count: versions.length })}</span>
      </div>
      <div style={s.list}>
        {versions.map((v) => (
          <div key={v.version} style={s.row}>
            <span className="mono" style={s.version}>
              {t("detail.versionBadge", { version: v.version })}
            </span>
            <span style={s.note}>{v.note || t("versions.noNote")}</span>
            <span style={s.date}>{new Date(v.created_at).toLocaleString()}</span>
            {v.current ? (
              <Badge color="var(--ok)" bg="var(--ok-bg)">
                {t("versions.current")}
              </Badge>
            ) : (
              <div style={s.actions}>
                <Button kind="ghost" size="sm" icon="Eye" onClick={() => setDiffVersion(v.version)}>
                  {t("versions.diff")}
                </Button>
                <Button
                  kind="ghost"
                  size="sm"
                  icon="RefreshCw"
                  disabled={restore.isPending}
                  onClick={() =>
                    confirm(
                      {
                        title: t("versions.restoreConfirm.title"),
                        body: t("versions.restoreConfirm.body", { version: v.version }),
                        confirmLabel: t("versions.restoreConfirm.confirm"),
                      },
                      () =>
                        restore.mutate(v.version, {
                          onSuccess: (data) => toast.success(t("config.saved", { version: data.version })),
                        }),
                    )
                  }
                >
                  {restore.isPending ? t("versions.restoring") : t("versions.restore")}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      {diffVersion != null && (
        <VersionDiffModal
          skillId={skill.id}
          version={diffVersion}
          currentBody={skill.body}
          onClose={() => setDiffVersion(null)}
        />
      )}
      {dialog}
    </div>
  );
}
