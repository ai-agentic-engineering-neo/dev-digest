/* VersionsTab — body snapshots, newest first. Diff compares a version with the
   current body; Restore creates a NEW version carrying that body (history is
   never rewritten). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { VersionDiffModal } from "../VersionDiffModal";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffOf, setDiffOf] = React.useState<number | null>(null);

  if (isLoading) return <Skeleton height={240} />;
  if (isError || !data) return <ErrorState title={t("versions.loadError")} onRetry={() => refetch()} />;

  const onRestore = (version: number) =>
    restore.mutate(
      { id: skill.id, version },
      { onSuccess: (next) => toast.success(t("versions.restoredToast", { from: version, to: next.version })) },
    );

  return (
    <div style={s.wrap}>
      <div style={s.titleRow}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        <Badge color="var(--text-secondary)">{t("versions.count", { count: data.length })}</Badge>
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>
      {data.map((v) => (
        <div key={v.version} style={s.row}>
          <span className="mono tnum" style={s.vChip(v.current)}>
            v{v.version}
          </span>
          <div style={s.meta}>
            <div style={s.note}>{v.change_note || t("versions.noNote")}</div>
            <div className="tnum" style={s.date}>
              {v.created_at.slice(0, 10)}
            </div>
          </div>
          {v.current ? (
            <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
              {t("versions.current")}
            </Badge>
          ) : (
            <div style={s.actions}>
              <Button kind="secondary" size="sm" icon="Eye" onClick={() => setDiffOf(v.version)}>
                {t("versions.diff")}
              </Button>
              <Button
                kind="secondary"
                size="sm"
                icon="History"
                onClick={() => onRestore(v.version)}
                disabled={restore.isPending}
              >
                {t("versions.restore")}
              </Button>
            </div>
          )}
        </div>
      ))}
      {diffOf != null && <VersionDiffModal skill={skill} version={diffOf} onClose={() => setDiffOf(null)} />}
    </div>
  );
}
