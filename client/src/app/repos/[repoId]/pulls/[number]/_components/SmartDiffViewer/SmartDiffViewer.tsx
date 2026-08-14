/* SmartDiffViewer — "Files changed" grouped by risk (core / wiring /
   boilerplate) instead of GitHub's flat order. Reuses FileCard/CodeLine for
   the actual diff rendering (patch parsing + inline commenting unchanged);
   only the grouping, boilerplate default-collapse, and findings badges are
   new. Deterministic — the grouping and finding_lines come from the server's
   GET /pulls/:id/smart-diff (no LLM call), this component just renders it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import type { FindingRecord, SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";
import { FileCard, type DiffCommentApi } from "@/components/diff-viewer";
import { ROLE_DOT_COLOR, ROLE_ORDER } from "./constants";
import { firstFindingForFile } from "./helpers";

const ROLE_LABEL_KEY: Record<SmartDiffRole, string> = {
  core: "coreLogic",
  wiring: "wiring",
  boilerplate: "boilerplate",
};
const ROLE_DESC_KEY: Record<SmartDiffRole, string> = {
  core: "coreLogicDesc",
  wiring: "wiringDesc",
  boilerplate: "boilerplateDesc",
};

export function SmartDiffViewer({
  files,
  groups,
  findings,
  commenting,
  onSelectFinding,
  focusTarget,
}: {
  files: PrFile[];
  groups: SmartDiffGroup[];
  /** Findings across all review runs — used only to resolve which finding a
     file's badge should jump to (by file + earliest start_line). */
  findings?: FindingRecord[];
  commenting?: DiffCommentApi;
  /** Findings-badge click switches to the Findings tab and expands/highlights
     that finding's card there — see PrDetailView's `handleSelectFinding`. */
  onSelectFinding?: (findingId: string) => void;
  /** specs/11-why-risk-brief.md AC-39/Q7 — see `DiffViewer`'s identical prop. */
  focusTarget?: { file: string; line: number | null; n: number } | null;
}) {
  const t = useTranslations("shell");

  const filesByPath = React.useMemo(() => {
    const m = new Map<string, PrFile>();
    for (const f of files) m.set(f.path, f);
    return m;
  }, [files]);

  const orderedGroups = ROLE_ORDER.map((role) => groups.find((g) => g.role === role)).filter(
    (g): g is SmartDiffGroup => !!g,
  );

  if (orderedGroups.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {orderedGroups.map((group) => (
        <div key={group.role}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 2px 10px",
              fontSize: 13,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 99,
                background: ROLE_DOT_COLOR[group.role],
                flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
              {t(`diffViewer.${ROLE_LABEL_KEY[group.role]}`)}
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              {t(`diffViewer.${ROLE_DESC_KEY[group.role]}`)}
            </span>
            <span style={{ flex: 1 }} />
            <span className="mono tnum" style={{ color: "var(--text-muted)" }}>
              {group.files.length}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {group.files.map((sf) => {
              const file = filesByPath.get(sf.path);
              if (!file) return null;
              const findingsCount = sf.finding_lines.length;
              return (
                <FileCard
                  key={sf.path}
                  file={file}
                  commenting={commenting}
                  defaultOpen={group.role === "boilerplate" ? false : undefined}
                  scrollTarget={
                    focusTarget && focusTarget.file === sf.path
                      ? { line: focusTarget.line, nonce: focusTarget.n }
                      : undefined
                  }
                  headerExtra={
                    findingsCount > 0 ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const finding = firstFindingForFile(findings ?? [], sf.path);
                          if (finding) onSelectFinding?.(finding.id);
                        }}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                      >
                        <Badge icon="AlertTriangle" color="var(--warn)">
                          {t("diffViewer.findingsBadge", { count: findingsCount })}
                        </Badge>
                      </button>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
