/* FindingCard — the ONE finding-card implementation shared by both the
   Columns and Tabs views of Multi-Agent Review (AC-16). Shows confidence,
   rationale, suggested fix and functional Accept/Dismiss (AC-17, AC-18),
   plus visible non-functional placeholders for Learn / Turn into eval case
   (AC-19) — those buttons are disabled and perform no
   request. Adapted from the PR-page FindingCard pattern; kept as its own
   copy here since that component lives outside this track's owned paths. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  Button,
  Markdown,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "./constants";
import { lineLabel } from "./helpers";
import { s } from "./styles";

export function FindingCard({
  f,
  focused,
  defaultExpanded,
  onAction,
  pending,
}: {
  f: FindingRecord;
  focused?: boolean;
  defaultExpanded?: boolean;
  /** Only "accept"/"dismiss" are wired to a persisted action (AC-18). */
  onAction?: (action: Extract<FindingActionKind, "accept" | "dismiss">) => void;
  pending?: boolean;
}) {
  const t = useTranslations("multiAgentReview");
  const [expanded, setExpanded] = React.useState(defaultExpanded ?? false);
  const sevColor = SEV_COLOR[f.severity] ?? SEV_COLOR_FALLBACK;
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;
  const muted = accepted || dismissed;

  return (
    <div data-finding-id={f.id} style={s.card(!!focused, sevColor, muted)}>
      <div onClick={() => setExpanded((e) => !e)} style={s.header}>
        <div style={s.badgeWrap}>
          <SeverityBadge severity={f.severity as Severity} compact />
        </div>
        <div style={s.headerMain}>
          <div style={s.titleRow}>
            <span style={s.title(muted, dismissed)}>{f.title}</span>
            <CategoryTag category={f.category as Category} />
            {accepted && <span style={s.acceptedTag}>{t("finding.accepted")}</span>}
            {dismissed && <span style={s.dismissedTag}>{t("finding.dismissed")}</span>}
          </div>
          <div style={s.metaRow}>
            <MonoLink>
              {f.file}:{lineLabel(f)}
            </MonoLink>
            <ConfidenceNum value={f.confidence} />
          </div>
        </div>
        <Icon.ChevronDown size={16} style={s.chevron(expanded)} />
      </div>

      {expanded && (
        <div style={s.body}>
          <div style={s.prose}>
            <Markdown>{f.rationale}</Markdown>
          </div>
          {f.suggestion && (
            <div style={s.suggestionWrap}>
              <div style={s.suggestionLabel}>{t("finding.suggestedFix")}</div>
              <div style={s.prose}>
                <Markdown>{f.suggestion}</Markdown>
              </div>
            </div>
          )}

          <div style={s.actions}>
            <Button
              kind="secondary"
              size="sm"
              icon="Check"
              disabled={pending}
              active={accepted}
              onClick={() => onAction?.("accept")}
            >
              {t("finding.accept")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              disabled={pending}
              active={dismissed}
              onClick={() => onAction?.("dismiss")}
            >
              {t("finding.dismiss")}
            </Button>
            <div style={s.placeholderDivider} aria-hidden="true" />
            {/* Visible, non-functional placeholders (AC-19) — reserved for
                future work (ДЗ Memory / evals L06). Disabled; no request. */}
            <Button kind="ghost" size="sm" icon="Lightbulb" disabled title={t("finding.comingSoon")}>
              {t("finding.learn")}
            </Button>
            <Button kind="ghost" size="sm" icon="FlaskConical" disabled title={t("finding.comingSoon")}>
              {t("finding.turnIntoEval")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
