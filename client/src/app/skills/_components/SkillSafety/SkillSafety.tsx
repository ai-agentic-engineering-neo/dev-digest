/* Skill safety UI — what a failed prompt-injection scan looks like:
   - SafetyBadge: red "Injection detected" pill (card, detail header).
   - SafetyBanner: red "DO NOT ENABLE" banner with the findings; a finding
     scrolls to its highlight when one is on screen.
   - HighlightedBody: the body as text with every finding marked in yellow,
     so the user sees at once what to remove. Text only, never rendered HTML. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { SkillSafety, SkillSafetyFinding } from "@devdigest/shared";
import { findingAnchorId, highlightSegments } from "./helpers";
import type { DraftSafety } from "./useDraftSafety";
import { s } from "./styles";

export function SafetyBadge() {
  const t = useTranslations("skills");
  return (
    <Badge color="var(--crit)" bg="var(--crit-bg)" icon="AlertOctagon">
      {t("safety.badge")}
    </Badge>
  );
}

export interface SafetyBannerProps {
  safety: SkillSafety;
  /** Title + text; defaults to the saved-skill wording. */
  title?: string;
  body?: string;
  /** Called when the finding's highlight is not on screen (e.g. switch tab). */
  onMissingAnchor?: () => void;
}

export function SafetyBanner({ safety, title, body, onMissingAnchor }: SafetyBannerProps) {
  const t = useTranslations("skills");
  const jump = (index: number) => {
    const el = document.getElementById(findingAnchorId(index));
    if (el) el.scrollIntoView?.({ block: "center", behavior: "smooth" });
    else onMissingAnchor?.();
  };
  return (
    <section role="alert" style={s.banner}>
      <div style={s.bannerHead}>
        <Icon.AlertOctagon size={16} style={{ color: "var(--crit)" }} />
        <span style={s.bannerTitle}>{title ?? t("safety.bannerTitle")}</span>
      </div>
      <p style={s.bannerBody}>{body ?? t("safety.bannerBody")}</p>
      <FindingList findings={safety.findings} onJump={jump} />
    </section>
  );
}

function FindingList({ findings, onJump }: { findings: SkillSafetyFinding[]; onJump: (i: number) => void }) {
  const t = useTranslations("skills");
  return (
    <ul style={s.list} aria-label={t("safety.findingsLabel")}>
      {findings.map((f, i) => (
        <li key={`${f.rule}:${f.start}`}>
          <button type="button" style={s.findingBtn} onClick={() => onJump(i)}>
            <span className="mono" style={s.findingLine}>
              {t("safety.line", { line: f.line })}
            </span>
            <span style={s.findingRule}>
              {t(`safety.rules.${f.rule}`)}
              {f.severity === "warn" ? ` · ${t("safety.warnOnly")}` : ""}
            </span>
            <span className="mono" style={s.findingExcerpt}>
              {f.excerpt}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export interface DraftSafetyNotesProps {
  draft: DraftSafety;
  body: string;
  /** The body differs from the saved one (a new skill: always true). */
  edited: boolean;
  /** The saved skill is flagged (shows "fixed" once the new text is clean). */
  wasFlagged?: boolean;
}

/**
 * Under a body editor: the body with every finding highlighted in yellow; for
 * an edited body also the "be careful" banner (flagged), a "fixed" note (a
 * flagged skill whose new text is clean) or a scan-failed note.
 */
export function DraftSafetyNotes({ draft, body, edited, wasFlagged = false }: DraftSafetyNotesProps) {
  const t = useTranslations("skills");
  if (draft.failed) return <p style={s.note}>{t("safety.scanFailed")}</p>;
  const safety = draft.safety;
  if (!safety) return null;
  const flagged = safety.status === "flagged";
  return (
    <div style={s.notes}>
      {edited && flagged && (
        <SafetyBanner safety={safety} title={t("safety.editorTitle")} body={t("safety.editorBody")} />
      )}
      {edited && !flagged && wasFlagged && (
        <p style={s.fixedNote} role="status">
          {t("safety.fixedNote")}
        </p>
      )}
      {safety.findings.length > 0 && <HighlightedBody body={body} findings={safety.findings} />}
    </div>
  );
}

export interface HighlightedBodyProps {
  body: string;
  findings: readonly SkillSafetyFinding[];
}

export function HighlightedBody({ body, findings }: HighlightedBodyProps) {
  const t = useTranslations("skills");
  const segments = highlightSegments(body, findings);
  return (
    <div style={s.bodyWrap}>
      <span style={s.bodyLabel}>{t("safety.highlightTitle")}</span>
      <pre className="mono" style={s.pre} data-testid="skill-highlighted-body">
        {segments.map((seg) =>
          seg.finding ? (
            <mark
              key={seg.start}
              id={findingAnchorId(seg.findingIndex!)}
              title={t(`safety.rules.${seg.finding.rule}`)}
              data-rule={seg.finding.rule}
              style={s.mark(seg.finding.severity === "block")}
            >
              {seg.text}
            </mark>
          ) : (
            <React.Fragment key={seg.start}>{seg.text}</React.Fragment>
          ),
        )}
      </pre>
    </div>
  );
}
