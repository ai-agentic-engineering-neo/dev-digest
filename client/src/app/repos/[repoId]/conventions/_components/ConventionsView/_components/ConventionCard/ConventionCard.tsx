/* ConventionCard — one candidate: rule (inline-editable), code evidence,
   confidence and Accept / Reject. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, MonoLink, ProgressBar, TextInput } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { confidenceColor } from "../../helpers";
import { s } from "./styles";

export function ConventionCard({
  candidate,
  fileHref,
  onAccept,
  onReject,
  onEditRule,
}: {
  candidate: ConventionCandidate;
  /** github.com link to the evidence file; null while the repo isn't known. */
  fileHref?: string | null;
  onAccept: (accepted: boolean) => void;
  onReject: () => void;
  onEditRule: (rule: string) => void;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(candidate.rule);

  const startEdit = () => {
    setDraft(candidate.rule);
    setEditing(true);
  };
  const save = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== candidate.rule) onEditRule(next);
  };
  const cancel = () => setEditing(false);
  const pct = Math.round(candidate.confidence * 100);

  return (
    <article style={s.card(candidate.accepted)}>
      <div style={s.main}>
        <div style={s.ruleRow}>
          {editing ? (
            <div style={s.editRow}>
              <TextInput
                value={draft}
                onChange={setDraft}
                aria-label={t("card.ruleLabel")}
                autoFocus
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    cancel();
                  }
                }}
              />
              <Button kind="primary" size="sm" onClick={save}>
                {t("card.save")}
              </Button>
              <Button kind="ghost" size="sm" onClick={cancel}>
                {t("card.cancel")}
              </Button>
            </div>
          ) : (
            <>
              <p style={s.rule}>{candidate.rule}</p>
              <Button kind="ghost" size="sm" icon="Edit" onClick={startEdit} aria-label={t("card.edit")} />
            </>
          )}
        </div>

        <div style={s.evidence}>
          <div className="mono" style={s.evidencePath}>
            {fileHref ? (
              <MonoLink href={fileHref}>{candidate.evidence_path}</MonoLink>
            ) : (
              <span>{candidate.evidence_path}</span>
            )}
          </div>
          <pre className="mono" style={s.snippet}>
            {candidate.evidence_snippet}
          </pre>
        </div>

        <div style={s.confRow}>
          <span>{t("card.confidence")}</span>
          <div style={s.confBar}>
            <ProgressBar value={pct} color={confidenceColor(candidate.confidence)} />
          </div>
          <span>{pct}%</span>
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind={candidate.accepted ? "primary" : "secondary"}
          icon="Check"
          aria-pressed={candidate.accepted}
          onClick={() => onAccept(!candidate.accepted)}
        >
          {candidate.accepted ? t("card.accepted") : t("card.acceptAsSkill")}
        </Button>
        <Button kind="ghost" icon="X" onClick={onReject}>
          {t("card.reject")}
        </Button>
      </div>
    </article>
  );
}
