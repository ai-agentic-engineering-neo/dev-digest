"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Icon, Markdown, Skeleton } from "@devdigest/ui";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { availableViews, formatTimestamp, resolveView, sortNewestFirst, type BodyView } from "./helpers";
import { VersionDiff } from "./_components/VersionDiff";
import { s } from "./styles";

/** Versions tab — immutable body snapshots, newest first; click to expand.
    An expanded version can be viewed as a line diff against the *current* version, a line
    diff against its previous version, or as rendered Markdown. Every non-current version has
    a Restore button: restore is append-only (it creates vN+1 whose body is the chosen
    version's), so history is never rewritten. */
export function SkillVersionsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useSkillVersions(skillId);
  const restore = useRestoreSkillVersion();
  const [open, setOpen] = React.useState<number | null>(null);
  const [view, setView] = React.useState<BodyView>("current");
  const [restoring, setRestoring] = React.useState<number | null>(null);

  // Collapse when switching skills.
  React.useEffect(() => {
    setOpen(null);
    setRestoring(null);
  }, [skillId]);

  if (isLoading) return <Skeleton height={160} />;
  if (isError || !data) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;

  const versions = sortNewestFirst(data);
  const latest = versions[0];
  const nextVersion = (latest?.version ?? 0) + 1;

  const confirmRestore = () => {
    if (restoring === null) return;
    const version = restoring;
    restore.mutate(
      { id: skillId, version },
      {
        // Failures are surfaced by the global mutation error toast; the dialog stays open to retry.
        onSuccess: (skill) => {
          toast.success(t("versions.restore.toast", { from: version, version: skill.version }));
          setRestoring(null);
        },
      },
    );
  };

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("versions.title")}</h2>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>
      {versions.length === 0 && <EmptyState icon="History" title={t("versions.empty")} />}
      {versions.map((v, idx) => {
        const expanded = open === v.version;
        const previous = versions[idx + 1];
        const isLatest = v.version === latest?.version;
        const views = availableViews(isLatest, !!previous);
        const activeView = resolveView(view, views);
        const Chevron = expanded ? Icon.ChevronDown : Icon.ChevronRight;
        return (
          <div key={v.version} style={s.item}>
            <div style={s.head}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={t("versions.toggleAria", { version: v.version })}
                onClick={() => setOpen(expanded ? null : v.version)}
                style={s.rowBtn}
              >
                <Chevron size={14} style={s.chevron} />
                <Badge color="var(--text-secondary)" mono>
                  {t("preview.version", { version: v.version })}
                </Badge>
                {isLatest && (
                  <Badge color="var(--ok)" bg="var(--ok-bg)">
                    {t("versions.current")}
                  </Badge>
                )}
                {v.restored_from != null && (
                  <Badge color="var(--accent-text)" bg="var(--accent-bg)" icon="History">
                    {t("versions.restoredFrom", { version: v.restored_from })}
                  </Badge>
                )}
                <span style={s.time}>{formatTimestamp(v.created_at)}</span>
              </button>
              {!isLatest && (
                <div style={s.restore}>
                  <Button
                    size="sm"
                    kind="secondary"
                    icon="RefreshCw"
                    aria-label={t("versions.restore.aria", { version: v.version })}
                    onClick={() => setRestoring(v.version)}
                  >
                    {t("versions.restore.button")}
                  </Button>
                </div>
              )}
            </div>
            {expanded && (
              <div style={s.body}>
                {views.length > 1 && (
                  <div style={s.viewToggle} role="group" aria-label={t("versions.view.label")}>
                    {views.map((key) => (
                      <Button
                        key={key}
                        size="sm"
                        kind="secondary"
                        active={activeView === key}
                        aria-pressed={activeView === key}
                        onClick={() => setView(key)}
                      >
                        {t(`versions.view.${key}`)}
                      </Button>
                    ))}
                  </div>
                )}
                {activeView === "current" && latest ? (
                  <VersionDiff
                    oldBody={v.body}
                    newBody={latest.body}
                    fromVersion={v.version}
                    currentVersion={latest.version}
                  />
                ) : activeView === "previous" && previous ? (
                  <VersionDiff oldBody={previous.body} newBody={v.body} fromVersion={previous.version} />
                ) : v.body.trim() ? (
                  <Markdown>{v.body}</Markdown>
                ) : (
                  <span style={s.empty}>{t("preview.empty")}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
      {restoring !== null && (
        <ConfirmDialog
          title={t("versions.restore.title", { version: restoring })}
          message={t("versions.restore.message", { version: restoring, next: nextVersion })}
          confirmLabel={t("versions.restore.confirm")}
          cancelLabel={t("versions.restore.cancel")}
          loading={restore.isPending}
          onConfirm={confirmRestore}
          onCancel={() => setRestoring(null)}
        />
      )}
    </div>
  );
}
