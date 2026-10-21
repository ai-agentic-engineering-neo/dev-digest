/* FindingComment — one persisted review finding rendered under its diff line
   (or in the end-of-file "outside the diff" block). Presentational: the
   Accept / Reject actions come in as a callback. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  SEV,
  SeverityBadge,
  CategoryTag,
  Button,
  IconBtn,
  Markdown,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";
import { fs } from "./styles";

export function FindingComment({
  finding: f,
  pending,
  onAction,
}: {
  finding: FindingRecord;
  pending?: boolean;
  onAction: (findingId: string, action: FindingActionKind) => void;
}) {
  const t = useTranslations("prReview");
  const [collapsed, setCollapsed] = React.useState(false);
  const sevColor = (SEV[f.severity as Severity] ?? SEV.INFO).c;
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;

  if (collapsed) {
    return (
      <div data-finding-id={f.id} style={fs.wrap(sevColor, accepted || dismissed)}>
        <button type="button" style={fs.collapsedRow} onClick={() => setCollapsed(false)}>
          <SeverityBadge severity={f.severity as Severity} compact />
          <span style={fs.title(dismissed)}>{f.title}</span>
          <span style={{ ...fs.meta, padding: 0 }}>
            {t("smartDiff.lineConfidence", { line: f.start_line, pct: Math.round(f.confidence * 100) })}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div data-finding-id={f.id} style={fs.wrap(sevColor, accepted || dismissed)}>
      <div style={fs.head}>
        <SeverityBadge severity={f.severity as Severity} compact />
        <span style={fs.title(dismissed)}>{f.title}</span>
        <CategoryTag category={f.category as Category} />
        {accepted && <span style={fs.acceptedTag}>{t("finding.accepted")}</span>}
        {dismissed && <span style={fs.dismissedTag}>{t("finding.dismissed")}</span>}
        <span style={fs.grow} />
        <IconBtn icon="X" size={24} label={t("smartDiff.collapseFinding")} onClick={() => setCollapsed(true)} />
      </div>
      <div style={fs.meta}>
        {t("smartDiff.lineConfidence", { line: f.start_line, pct: Math.round(f.confidence * 100) })}
      </div>
      <div style={fs.body}>
        <div style={fs.prose}>
          <Markdown>{f.rationale}</Markdown>
        </div>
        {f.suggestion && (
          <div style={fs.fixBox}>
            <div style={fs.fixLabel}>{t("finding.suggestedFix")}</div>
            <div style={fs.prose}>
              <Markdown>{f.suggestion}</Markdown>
            </div>
          </div>
        )}
        <div style={fs.actions}>
          <Button
            kind="secondary"
            size="sm"
            icon="Check"
            disabled={pending}
            active={accepted}
            onClick={() => onAction(f.id, "accept")}
          >
            {t("finding.accept")}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            icon="X"
            disabled={pending}
            active={dismissed}
            onClick={() => onAction(f.id, "dismiss")}
          >
            {t("finding.dismiss")}
          </Button>
        </div>
      </div>
    </div>
  );
}
