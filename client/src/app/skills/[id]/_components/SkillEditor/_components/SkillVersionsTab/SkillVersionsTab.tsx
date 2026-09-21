"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, Markdown, Skeleton } from "@devdigest/ui";
import { useSkillVersions } from "@/lib/hooks/skills";
import { formatTimestamp, sortNewestFirst } from "./helpers";
import { VersionDiff } from "./_components/VersionDiff";
import { s } from "./styles";

type BodyView = "changes" | "rendered";

/** Versions tab — immutable body snapshots, newest first; click to expand.
    Each version (except the first) can be viewed as a line diff against the
    previous version or as rendered Markdown. No restore action. */
export function SkillVersionsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { data, isLoading, isError, refetch } = useSkillVersions(skillId);
  const [open, setOpen] = React.useState<number | null>(null);
  const [view, setView] = React.useState<BodyView>("changes");

  // Collapse when switching skills.
  React.useEffect(() => setOpen(null), [skillId]);

  if (isLoading) return <Skeleton height={160} />;
  if (isError || !data) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;

  const versions = sortNewestFirst(data);
  const latest = versions[0]?.version;

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("versions.title")}</h2>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>
      {versions.length === 0 && <EmptyState icon="History" title={t("versions.empty")} />}
      {versions.map((v, idx) => {
        const expanded = open === v.version;
        const previous = versions[idx + 1];
        const showDiff = !!previous && view === "changes";
        const Chevron = expanded ? Icon.ChevronDown : Icon.ChevronRight;
        return (
          <div key={v.version} style={s.item}>
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
              {v.version === latest && (
                <Badge color="var(--ok)" bg="var(--ok-bg)">
                  {t("versions.current")}
                </Badge>
              )}
              <span style={s.time}>{formatTimestamp(v.created_at)}</span>
            </button>
            {expanded && (
              <div style={s.body}>
                {previous && (
                  <div style={s.viewToggle} role="group" aria-label={t("versions.view.label")}>
                    <Button
                      size="sm"
                      kind="secondary"
                      active={view === "changes"}
                      aria-pressed={view === "changes"}
                      onClick={() => setView("changes")}
                    >
                      {t("versions.view.changes")}
                    </Button>
                    <Button
                      size="sm"
                      kind="secondary"
                      active={view === "rendered"}
                      aria-pressed={view === "rendered"}
                      onClick={() => setView("rendered")}
                    >
                      {t("versions.view.rendered")}
                    </Button>
                  </div>
                )}
                {showDiff ? (
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
    </div>
  );
}
