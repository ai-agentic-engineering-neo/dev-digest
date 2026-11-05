/* VersionsTab — Versions design: every content save is a version (vN, note,
   date). The newest is Current; older ones offer Diff (vs current) and Restore
   (= save that body as a NEW version, "Restored from vN" — history is kept). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import type { SkillVersionRecord } from "@/lib/types";
import { useSkillVersions, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { DiffModal } from "./_components/DiffModal";
import { versionDate } from "./helpers";
import { s } from "./styles";
import { errorMessage } from "@/lib/error-message";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const update = useUpdateSkill();
  const [diffOf, setDiffOf] = React.useState<SkillVersionRecord | null>(null);

  if (isLoading) {
    return (
      <div style={s.list}>
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    );
  }
  if (isError || !data) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;

  const current = data[0];
  const restore = (v: SkillVersionRecord) => {
    if (!window.confirm(t("versions.restoreConfirm", { version: v.version }))) return;
    update.mutate(
      { id: skill.id, patch: { body: v.body, note: t("versions.restoredNote", { version: v.version }) } },
      {
        onSuccess: (saved) => toast.success(t("versions.restored", { version: saved.version })),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <div>
      {diffOf && current && (
        <DiffModal
          fromVersion={diffOf.version}
          fromBody={diffOf.body}
          toVersion={current.version}
          toBody={current.body}
          onClose={() => setDiffOf(null)}
        />
      )}
      <div style={s.head}>
        <h2 style={s.title}>{t("versions.title")}</h2>
        <span style={s.chip}>{t("versions.count", { count: data.length })}</span>
      </div>
      <p style={s.hint}>{t("versions.hint")}</p>
      <div style={s.list} role="list">
        {data.map((v) => {
          const isCurrent = v.version === current?.version;
          return (
            <div key={v.version} role="listitem" style={s.row(isCurrent)} data-testid={`version-v${v.version}`}>
              <span className="mono" style={s.badge(isCurrent)}>
                {t("detail.version", { version: v.version })}
              </span>
              <div style={s.text}>
                <div style={s.note}>{v.note ?? t("versions.noteFallback")}</div>
                <div style={s.date}>{versionDate(v.created_at)}</div>
              </div>
              {isCurrent ? (
                <span style={s.current}>
                  <span style={s.dot} />
                  {t("versions.current")}
                </span>
              ) : (
                <div style={s.actions}>
                  <Button size="sm" kind="ghost" icon="Eye" onClick={() => setDiffOf(v)}>
                    {t("versions.diff")}
                  </Button>
                  <Button size="sm" icon="History" onClick={() => restore(v)} disabled={update.isPending}>
                    {t("versions.restore")}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
