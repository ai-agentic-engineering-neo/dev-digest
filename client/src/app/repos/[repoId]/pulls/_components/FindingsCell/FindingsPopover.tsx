/* FindingsPopover — the preview the FINDINGS cell opens on hover (M1):
   "N findings in this run", then the findings of each agent's latest review,
   most severe first. N is the number of findings listed, so the heading always
   matches the list; while the reviews load it is the chips' total. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV, type Severity } from "@devdigest/ui";
import type { PreviewFinding } from "../../helpers";
import { PREVIEW_LIMIT } from "./constants";
import { s, type PopoverAnchor } from "./styles";

export interface FindingsPopoverProps {
  id: string;
  anchor: PopoverAnchor;
  /** Findings to preview; undefined until the reviews have loaded. */
  findings: PreviewFinding[] | undefined;
  /** The chips' total, used for the heading until `findings` arrives. */
  expectedCount: number;
  isError: boolean;
}

export function FindingsPopover({ id, anchor, findings, expectedCount, isError }: FindingsPopoverProps) {
  const t = useTranslations("prReview");
  const count = findings ? findings.length : expectedCount;
  const listed = findings?.slice(0, PREVIEW_LIMIT) ?? [];
  const more = (findings?.length ?? 0) - listed.length;
  return (
    // The preview only describes the cell; a click on it must not open the PR.
    <div id={id} role="tooltip" style={s.popover(anchor)} onClick={(e) => e.stopPropagation()}>
      <div style={s.card}>
        <div style={s.title}>{t("list.findingsPopoverTitle", { count })}</div>
        {isError ? (
          <div style={s.note}>{t("list.findingsError")}</div>
        ) : !findings ? (
          <div style={s.note}>{t("list.findingsLoading")}</div>
        ) : (
          <>
            <ul style={s.list}>
              {listed.map(({ finding, agentName }) => {
                const sev = SEV[finding.severity as Severity] ?? SEV.INFO;
                const SevIcon = Icon[sev.icon];
                return (
                  <li key={finding.id} style={s.item}>
                    <SevIcon size={14} style={s.itemIcon(sev.c)} aria-label={finding.severity} />
                    <div style={s.itemBody}>
                      <div style={s.itemTitle}>{finding.title}</div>
                      <div className="mono" style={s.itemMeta}>
                        {finding.file}:{finding.start_line}
                        {agentName ? ` · ${agentName}` : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {more > 0 && <div style={s.note}>{t("list.findingsMore", { count: more })}</div>}
          </>
        )}
      </div>
    </div>
  );
}

export default FindingsPopover;
