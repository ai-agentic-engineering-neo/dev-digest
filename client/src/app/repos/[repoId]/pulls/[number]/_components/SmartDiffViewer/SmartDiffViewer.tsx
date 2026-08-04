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
import type { SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";
import { FileCard, type DiffCommentApi } from "@/components/diff-viewer";
import { ROLE_DOT_COLOR, ROLE_ORDER } from "./constants";

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

interface ScrollTarget {
  path: string;
  line: number;
  nonce: number;
}

export function SmartDiffViewer({
  files,
  groups,
  commenting,
}: {
  files: PrFile[];
  groups: SmartDiffGroup[];
  commenting?: DiffCommentApi;
}) {
  const t = useTranslations("shell");
  const [target, setTarget] = React.useState<ScrollTarget | null>(null);

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
                    target?.path === sf.path
                      ? { line: target.line, nonce: target.nonce }
                      : undefined
                  }
                  headerExtra={
                    findingsCount > 0 ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTarget((prev) => ({
                            path: sf.path,
                            line: sf.finding_lines[0]!,
                            nonce: (prev?.nonce ?? 0) + 1,
                          }));
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
