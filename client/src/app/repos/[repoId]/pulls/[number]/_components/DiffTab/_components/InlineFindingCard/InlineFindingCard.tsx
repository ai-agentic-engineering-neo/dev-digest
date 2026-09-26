/* InlineFindingCard — a finding written out in full under the diff line it
   cites: severity tile + word, title, category, line range, confidence,
   markdown rationale, a "Suggested fix" box and Accept / Dismiss. Slotted into
   the shared diff-viewer as `DiffFindingApi.Card` (it never imports route
   code). The Agent runs tab keeps its own collapsible `FindingCard`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Icon,
  IconBtn,
  CategoryTag,
  ConfidenceNum,
  Button,
  Markdown,
  SEV,
  type Category,
} from "@devdigest/ui";
import type { InlineFindingCardProps } from "@/components/diff-viewer";
import { SEVERITY_WORD_KEY } from "../../constants";
import { lineRange } from "../../helpers";
import { s } from "./styles";

export function InlineFindingCard({ f, pending, onAction, onClose }: InlineFindingCardProps) {
  const t = useTranslations("prReview");
  const tShell = useTranslations("shell");
  const sev = SEV[f.severity];
  const SevIcon = Icon[sev.icon];
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;

  return (
    <div data-finding-id={f.id} data-severity={f.severity} style={s.card(sev.c, accepted || dismissed)}>
      <div style={s.header}>
        <span style={s.iconTile(sev.c, sev.bg)}>
          <SevIcon size={14} aria-hidden />
        </span>
        <div style={s.headerMain}>
          <div style={s.titleRow}>
            <span style={s.sevWord(sev.c)}>{tShell(SEVERITY_WORD_KEY[f.severity])}</span>
            <span style={s.title(dismissed)}>{f.title}</span>
            <CategoryTag category={f.category as Category} />
            {accepted && (
              <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check" style={s.acceptedBadge}>
                {t("finding.accepted")}
              </Badge>
            )}
            {dismissed && <span style={s.dismissedTag}>{t("finding.dismissed")}</span>}
          </div>
          <div style={s.metaRow}>
            <span className="mono" style={s.lineRange}>
              {t("smartDiff.findingLine", { range: lineRange(f) })}
            </span>
            <ConfidenceNum value={f.confidence} />
          </div>
        </div>
        {onClose && <IconBtn icon="X" label={t("smartDiff.collapseFinding")} size={26} onClick={onClose} />}
      </div>

      <div style={s.body}>
        <div style={s.prose}>
          <Markdown>{f.rationale}</Markdown>
        </div>
        {f.suggestion && (
          <div style={s.suggestionBox}>
            <Icon.Lightbulb size={14} style={s.suggestionIcon} aria-hidden />
            <div>
              <div style={s.suggestionLabel}>{t("finding.suggestedFix")}</div>
              <div style={s.prose}>
                <Markdown>{f.suggestion}</Markdown>
              </div>
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
        </div>
      </div>
    </div>
  );
}
