/* VersionsTab — immutable body snapshots, newest first. Diff compares a version
   with the current body; Restore saves an old body as a NEW version. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { MARK } from "./constants";
import { hasChanges, toDiffLines } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffOf, setDiffOf] = React.useState<SkillVersion | null>(null);

  const onRestore = (v: SkillVersion) => {
    if (!window.confirm(t("versions.restoreConfirm", { version: v.version }))) return;
    restore.mutate(
      { id: skill.id, version: v.version },
      { onSuccess: (data) => toast.success(t("versions.restored", { from: v.version, to: data.version })) },
    );
  };

  const diff = diffOf ? toDiffLines(diffOf.body, skill.body) : [];

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        {versions && <Badge>{t("versions.count", { count: versions.length })}</Badge>}
      </div>
      <div style={s.sub}>{t("versions.subtitle")}</div>

      {isLoading && <Skeleton height={120} />}
      {isError && <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />}
      {versions?.map((v) => {
        const current = v.version === skill.version;
        return (
          <div key={v.version} style={s.row} data-testid="skill-version">
            <span className="mono" style={s.version}>{`v${v.version}`}</span>
            {current && (
              <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
                {t("versions.current")}
              </Badge>
            )}
            <span style={s.date}>{new Date(v.created_at).toLocaleString()}</span>
            <div style={s.actions}>
              {!current && (
                <Button size="sm" kind="ghost" icon="GitCompare" onClick={() => setDiffOf(v)}>
                  {t("versions.diff")}
                </Button>
              )}
              {!current && (
                <Button size="sm" kind="secondary" icon="RotateCcw" onClick={() => onRestore(v)} disabled={restore.isPending}>
                  {t("versions.restore")}
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {diffOf && (
        <Modal
          width={900}
          title={t("versions.diffTitle", { from: diffOf.version, to: skill.version })}
          onClose={() => setDiffOf(null)}
        >
          {hasChanges(diff) ? (
            <pre className="mono" style={s.diff}>
              {diff.map((l, i) => (
                <div key={i} style={s.diffLine(l.kind)}>
                  {MARK[l.kind]} {l.text}
                </div>
              ))}
            </pre>
          ) : (
            <div style={s.noChanges}>{t("versions.noChanges")}</div>
          )}
        </Modal>
      )}
    </div>
  );
}
