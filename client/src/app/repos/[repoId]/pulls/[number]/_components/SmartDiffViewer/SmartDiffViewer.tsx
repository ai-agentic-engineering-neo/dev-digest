/* SmartDiffViewer — Smart Diff (A2): groups changed files into
   core/wiring/boilerplate, shows finding-line markers per file, and a split
   nudge banner when the PR is too big (§7). Each role group is a collapsible
   accordion (like the agent-run accordions) so you can focus on one role.
   Falls back to the basic DiffViewer for the raw patch of each file. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Button } from "@devdigest/ui";
import type { SmartDiff, PrFile } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi } from "../../../../../../../components/diff-viewer";
import { ROLE_META } from "./constants";
import { indexByPath, resolveGroupFiles, totalFindingLines } from "./helpers";
import { s } from "./styles";

type SmartDiffGroup = SmartDiff["groups"][number];
type ByPath = ReturnType<typeof indexByPath>;

/** One collapsible role group (Core / Wiring / Boilerplate). */
function GroupSection({
  group,
  byPath,
  commenting,
  defaultOpen,
}: {
  group: SmartDiffGroup;
  byPath: ByPath;
  commenting?: DiffCommentApi;
  defaultOpen: boolean;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(defaultOpen);
  const meta = ROLE_META[group.role];
  const GroupIcon = Icon[meta.icon];
  const groupFiles = resolveGroupFiles(group.files, byPath);
  const hasFindings = group.files.some((f) => f.finding_lines.length > 0);

  return (
    <section>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        style={{ ...s.groupHeader, cursor: "pointer", marginBottom: open ? 12 : 0 }}
      >
        <Icon.ChevronDown
          size={15}
          style={{
            color: "var(--text-muted)",
            transform: open ? "none" : "rotate(-90deg)",
            transition: "transform .15s",
          }}
        />
        <GroupIcon size={14} style={{ color: meta.color }} />
        <span style={s.groupLabel(meta.color)}>{t(`smartDiff.${meta.labelKey}`)}</span>
        <Badge color="var(--text-muted)">{group.files.length}</Badge>
        {hasFindings && (
          <Badge color="var(--crit)" bg="var(--crit-bg)" icon="AlertOctagon">
            {t("smartDiff.findingLines", { count: totalFindingLines(group.files) })}
          </Badge>
        )}
      </div>

      {open &&
        (groupFiles.length > 0 ? (
          <DiffViewer files={groupFiles} commenting={commenting} />
        ) : (
          <div style={s.fileList}>
            {group.files.map((f, i) => (
              <div key={i} style={s.fileRow}>
                <Icon.FileText size={13} style={s.fileIcon} />
                <span className="mono" style={s.filePath}>
                  {f.path}
                </span>
                <span className="mono tnum" style={s.fileStat}>
                  <span style={s.addCount}>+{f.additions}</span>{" "}
                  <span style={s.delCount}>−{f.deletions}</span>
                </span>
                {f.finding_lines.length > 0 && (
                  <span style={s.fileFlag}>⚑ {f.finding_lines.length}</span>
                )}
              </div>
            ))}
          </div>
        ))}
    </section>
  );
}

export function SmartDiffViewer({
  smartDiff,
  files,
  commenting,
}: {
  smartDiff: SmartDiff;
  files: PrFile[];
  commenting?: DiffCommentApi;
}) {
  const t = useTranslations("prReview");
  const byPath = React.useMemo(() => indexByPath(files), [files]);

  const { too_big, total_lines, proposed_splits } = smartDiff.split_suggestion;

  return (
    <div style={s.root}>
      {too_big && (
        <div style={s.nudge}>
          <Icon.Slash size={18} style={s.nudgeIcon} />
          <div style={s.nudgeBody}>
            <div style={s.nudgeTitle}>{t("smartDiff.largeTitle", { lines: total_lines })}</div>
            <p style={s.nudgeText}>{t("smartDiff.largeBody")}</p>
            <div style={s.splitList}>
              {proposed_splits.map((split, i) => (
                <div key={i} style={s.splitRow}>
                  <Icon.CornerDownRight size={13} style={s.splitIcon} />
                  <span style={s.splitName}>{split.name}</span>
                  <Badge color="var(--text-muted)">
                    {t("smartDiff.filesCount", { count: split.files.length })}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {smartDiff.groups.map((group, i) => (
        <GroupSection
          key={group.role}
          group={group}
          byPath={byPath}
          commenting={commenting}
          defaultOpen={i === 0}
        />
      ))}

      <div style={s.footer}>
        <Button kind="ghost" size="sm" icon="RefreshCw" disabled>
          {t("smartDiff.groupedByRole")}
        </Button>
      </div>
    </div>
  );
}
