"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { countChanges, diffLines, withContext } from "../../diff";
import { s } from "./styles";

const SIGN = { add: "+", del: "−", same: " " } as const;

/** Unified line diff of a skill body between two versions. */
export function VersionDiff({ oldBody, newBody, fromVersion }: { oldBody: string; newBody: string; fromVersion: number }) {
  const t = useTranslations("skills");
  const lines = React.useMemo(() => diffLines(oldBody, newBody), [oldBody, newBody]);

  if (!lines) return <p style={s.note}>{t("versions.diff.tooLarge")}</p>;
  const { added, removed } = countChanges(lines);
  if (added === 0 && removed === 0) return <p style={s.note}>{t("versions.diff.noChanges", { version: fromVersion })}</p>;

  return (
    <div>
      <div style={s.summary}>
        <span>{t("versions.diff.against", { version: fromVersion })}</span>
        <span style={s.added}>+{added}</span>
        <span style={s.removed}>−{removed}</span>
      </div>
      <div className="mono" style={s.table} role="group" aria-label={t("versions.diff.aria", { version: fromVersion })}>
        {withContext(lines).map((row, idx) =>
          row.type === "gap" ? (
            <div key={`gap-${idx}`} style={s.gap}>
              {t("versions.diff.unchanged", { count: row.count })}
            </div>
          ) : (
            <div key={idx} data-diff={row.type} style={s.row(row.type)}>
              <span style={s.gutter}>{row.oldNo ?? ""}</span>
              <span style={s.gutter}>{row.newNo ?? ""}</span>
              <span style={s.sign} aria-label={t(`versions.diff.${row.type}`)}>
                {SIGN[row.type]}
              </span>
              <span style={s.text}>{row.text || " "}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
