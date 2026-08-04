/* Versions tab — append-only history, newest first. Selecting a row shows that
   body read-only beside the current one.

   Restore does NOT rewrite history: it goes through the same path as copying
   an old body back into the editor and saving — the current body is archived
   at its own version, `skills.version` bumps, and the restored body becomes
   current. So "restore v1" while at v2 produces v3, not a rewound v1. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { deltaSign, formatTimestamp, versionRows } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [selected, setSelected] = React.useState<number | null>(null);

  // A different skill's history invalidates the selection.
  React.useEffect(() => setSelected(null), [skill.id]);

  if (isLoading) return <Skeleton height={240} />;
  if (isError) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;

  const rows = versionRows(data ?? []);
  if (rows.length === 0) {
    return <EmptyState icon="History" title={t("versions.title")} body={t("versions.empty")} />;
  }

  const chosen = rows.find((r) => r.version === selected) ?? null;

  return (
    <div style={s.wrap}>
      <div style={s.list}>
        <p style={s.hint}>{t("versions.hint")}</p>
        {rows.map((r) => (
          <button
            key={r.version}
            type="button"
            onClick={() => setSelected(r.version)}
            style={s.row(r.version === selected)}
          >
            <span style={s.rowTop}>
              <span style={s.rowVersion}>{t("versions.row", { version: r.version })}</span>
              <span className="tnum" style={s.rowDelta}>
                {r.delta == null
                  ? t("versions.noDelta")
                  : t("versions.delta", {
                      sign: deltaSign(r.delta),
                      bytes: Math.abs(r.delta),
                    })}
              </span>
            </span>
            <span style={s.rowTime}>{formatTimestamp(r.createdAt)}</span>
          </button>
        ))}
      </div>

      {chosen ? (
        <div style={s.panes}>
          <div style={s.pane}>
            <div style={s.paneHeadRow}>
              <span style={s.paneHeadText}>{t("versions.selected", { version: chosen.version })}</span>
              <Button
                kind="secondary"
                size="sm"
                icon="History"
                disabled={restore.isPending}
                onClick={() => {
                  if (!window.confirm(t("versions.restoreConfirm", { version: chosen.version }))) return;
                  restore.mutate(
                    { id: skill.id, version: chosen.version },
                    {
                      onSuccess: (data) => {
                        setSelected(null);
                        toast.success(t("versions.restoreToast", { version: data.version }));
                      },
                      onError: () => toast.error(t("versions.restoreFailed")),
                    },
                  );
                }}
              >
                {t("versions.restore")}
              </Button>
            </div>
            <pre className="mono" style={s.paneBody}>
              {chosen.body}
            </pre>
          </div>
          <div style={s.pane}>
            <div style={s.paneHead}>{t("versions.current", { version: skill.version })}</div>
            <pre className="mono" style={s.paneBody}>
              {skill.body}
            </pre>
          </div>
        </div>
      ) : (
        <p style={s.placeholder}>{t("versions.selectPrompt")}</p>
      )}
    </div>
  );
}
