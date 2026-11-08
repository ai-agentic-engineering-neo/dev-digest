/* ProjectContextBlock — the trace's "Project context" section body: which attached docs the run
   sent to the model, which were left out and why, and which attached docs the PR itself changes.
   Doc paths are untrusted text: rendered as plain text only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { LeftOutReason, ProjectContextTrace } from "@/lib/types";
import { s } from "./styles";

const REASON_COLOR: Record<LeftOutReason, { color: string; bg: string }> = {
  too_large: { color: "var(--warn)", bg: "var(--warn-bg)" },
  over_cap: { color: "var(--warn)", bg: "var(--warn-bg)" },
  missing: { color: "var(--crit)", bg: "var(--crit-bg)" },
};

export function ProjectContextBlock({ block }: { block: ProjectContextTrace }) {
  const t = useTranslations("runs.trace.projectContext");
  const tTrace = useTranslations("runs.trace");

  if (block.status === "unavailable") {
    return (
      <div style={s.root}>
        <span style={s.unavailable}>{t("unavailable")}</span>
        <ul style={s.list}>
          {block.attached.map((p) => (
            <li key={p} style={s.item}>
              <span className="mono" style={s.path} title={p}>
                {p}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div style={s.root}>
      <span style={s.summary}>
        {t("summary", { included: block.included.length, tokens: block.total_tokens, cap: block.cap_tokens })}
      </span>

      <div style={s.group}>
        <span style={s.groupLabel}>{t("included")}</span>
        {block.included.length === 0 ? (
          <span style={s.none}>{t("none")}</span>
        ) : (
          <ul style={s.list}>
            {block.included.map((d) => (
              <li key={d.path} style={s.item}>
                <span className="mono" style={s.path} title={d.path}>
                  {d.path}
                </span>
                <span style={s.tokens}>{tTrace("prompt.tokensApprox", { count: d.tokens })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {block.left_out.length > 0 && (
        <div style={s.group}>
          <span style={s.groupLabel}>{t("leftOut")}</span>
          <ul style={s.list}>
            {block.left_out.map((d) => (
              <li key={d.path} style={s.item}>
                <span className="mono" style={s.path} title={d.path}>
                  {d.path}
                </span>
                {d.tokens != null && <span style={s.tokens}>{tTrace("prompt.tokensApprox", { count: d.tokens })}</span>}
                <Badge color={REASON_COLOR[d.reason].color} bg={REASON_COLOR[d.reason].bg}>
                  {t(`reason.${d.reason}`)}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {block.changed_by_pr.map((p) => (
        <span key={p} style={s.note}>
          {t("prChanges", { path: p })}
        </span>
      ))}
    </div>
  );
}
