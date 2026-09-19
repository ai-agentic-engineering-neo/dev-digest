"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { diffLines, formatDate } from "../../../../helpers";
import { s } from "./styles";

/**
 * Versions — every save snapshotted the body, so a run's trace can always be
 * matched back to the exact text it scored. Restore writes the old body
 * forward as a NEW version (append-only history, §5.2) — it never rewrites
 * the row it restored from.
 */
export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const update = useUpdateSkill();
  const [openDiff, setOpenDiff] = React.useState<number | null>(null);

  if (isLoading || !versions) {
    return (
      <div style={s.wrap}>
        <Skeleton height={20} width={220} />
        <Skeleton height={80} style={{ marginTop: 16 }} />
      </div>
    );
  }
  if (isError) {
    return <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />;
  }

  const restore = (version: number) => {
    // Restore-forward is server-side (§5.2): it loads that version's body
    // itself and labels the new version "Restored from vN" — the client
    // never re-sends a copy of the old body.
    update.mutate(
      { id: skill.id, patch: { restore_from_version: version } },
      { onSuccess: (data) => toast.success(t("versions.restoredToast", { version: data.version })) },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>{t("versions.header", { count: versions.length })}</div>
      <div style={s.subtitle}>{t("versions.subtitle")}</div>

      {versions.map((v, i) => {
        const isCurrent = i === 0;
        const diffOpen = openDiff === v.version;
        return (
          <React.Fragment key={v.version}>
            <div style={s.row}>
              <span className="mono" style={isCurrent ? { ...s.version, ...s.versionCurrent } : s.version}>
                v{v.version}
              </span>
              <span style={s.message}>{v.message ?? "—"}</span>
              <span style={s.date}>{formatDate(v.created_at)}</span>
              {/* Far right, where the Diff/Restore pair sits on every other row. */}
              {isCurrent && (
                <span style={s.currentBadge}>
                  <Badge dot color="var(--ok)" bg="var(--ok-bg)">
                    {t("versions.current")}
                  </Badge>
                </span>
              )}
              {!isCurrent && (
                <div style={s.actions}>
                  <Button
                    kind="tertiary"
                    size="sm"
                    icon="Eye"
                    active={diffOpen}
                    onClick={() => setOpenDiff(diffOpen ? null : v.version)}
                  >
                    {t("versions.diff")}
                  </Button>
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="History"
                    onClick={() => restore(v.version)}
                    disabled={update.isPending}
                  >
                    {t("versions.restore")}
                  </Button>
                </div>
              )}
            </div>
            {diffOpen && (
              <div style={s.diffPanel}>
                {diffLines(v.body, skill.body).map((line, idx) => (
                  <div key={idx} style={s.diffLine(line.op)}>
                    {line.op === "add" ? "+ " : line.op === "remove" ? "- " : "  "}
                    {line.text}
                  </div>
                ))}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
