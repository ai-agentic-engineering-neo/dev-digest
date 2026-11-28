/* VersionsTab — every saved version, newest first. The current one is marked;
   any other can be diffed against the current body or restored as a new
   version (history is never rewritten). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { nextVersion } from "../../helpers";
import { VersionDiffModal } from "../VersionDiffModal";
import { LOADING_ROWS, ROW_HEIGHT } from "./constants";
import { isCurrentVersion, isoDate, newestFirst } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill, dirty, onRestored }: { skill: Skill; dirty: boolean; onRestored: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffing, setDiffing] = React.useState<number | null>(null);
  const [restoring, setRestoring] = React.useState<number | null>(null);
  const list = newestFirst(versions ?? []);

  const confirmRestore = (version: number) => {
    setRestoring(null);
    restore.mutate(
      { id: skill.id, version },
      {
        onSuccess: (next) => {
          onRestored();
          toast.success(t("versions.restoredToast", { version, next: next.version }));
        },
      },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.titleRow}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        {versions && <Badge>{t("versions.count", { count: versions.length })}</Badge>}
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>
      {restore.error && (
        <div role="alert" style={s.error}>
          {restore.error.message}
        </div>
      )}
      {isLoading && (
        <div style={s.list}>
          {LOADING_ROWS.map((k) => (
            <Skeleton key={k} height={ROW_HEIGHT} />
          ))}
        </div>
      )}
      {isError && <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />}
      <ul style={s.list} aria-label={t("versions.title")}>
        {list.map((v) => {
          const current = isCurrentVersion(v, skill);
          return (
            <li key={v.version} style={s.row(current)}>
              <span className="mono" style={s.chip(current)}>
                {t("detail.version", { version: v.version })}
              </span>
              <div style={s.text}>
                <div style={v.note ? s.note : s.noNote}>{v.note || t("versions.noNote")}</div>
                <div className="mono" style={s.date}>
                  {isoDate(v.created_at)}
                </div>
              </div>
              {current ? (
                <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
                  {t("versions.current")}
                </Badge>
              ) : (
                <div style={s.actions}>
                  <Button kind="ghost" size="sm" icon="Eye" onClick={() => setDiffing(v.version)}>
                    {t("versions.diff")}
                  </Button>
                  <span title={dirty ? t("versions.restoreDisabled") : undefined}>
                    <Button
                      kind="secondary"
                      size="sm"
                      icon="History"
                      disabled={dirty || restore.isPending}
                      onClick={() => {
                        restore.reset();
                        setRestoring(v.version);
                      }}
                    >
                      {t("versions.restore")}
                    </Button>
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {diffing != null && <VersionDiffModal skill={skill} version={diffing} onClose={() => setDiffing(null)} />}
      {restoring != null && (
        <ConfirmDialog
          title={t("versions.restoreTitle")}
          message={t("versions.restoreConfirm", { version: restoring, next: nextVersion(skill) })}
          confirmLabel={t("versions.restoreLabel")}
          onConfirm={() => confirmRestore(restoring)}
          onCancel={() => setRestoring(null)}
        />
      )}
    </div>
  );
}
