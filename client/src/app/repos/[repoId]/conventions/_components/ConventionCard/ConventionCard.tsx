/* ConventionCard — one candidate: its rule (click to edit), category and
   decision badges, the code evidence linked to GitHub, the confidence bar and
   Accept / Reject. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ProgressBar, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, ConventionStatus, Repo } from "@devdigest/shared";
import { RULE_EDITOR_ROWS } from "./constants";
import { evidenceLocation } from "../../helpers";
import { confidenceColor, confidencePercent, evidenceUrl, nextStatus } from "./helpers";
import { s } from "./styles";

export interface ConventionCardProps {
  candidate: ConventionCandidate;
  repo: Pick<Repo, "full_name" | "default_branch"> | null;
  onDecide: (status: ConventionStatus) => void;
  onEditRule: (rule: string) => void;
}

export function ConventionCard({ candidate: c, repo, onDecide, onEditRule }: ConventionCardProps) {
  const t = useTranslations("conventions");
  const [draft, setDraft] = React.useState<string | null>(null);
  const location = evidenceLocation(c);
  const href = evidenceUrl(repo, c);

  const save = () => {
    const rule = draft?.trim() ?? "";
    if (rule && rule !== c.rule) onEditRule(rule);
    setDraft(null);
  };

  return (
    <article style={s.card(c.status)} aria-label={c.rule}>
      <div style={s.head}>
        <div style={s.ruleCol}>
          {draft === null ? (
            <button type="button" style={s.rule} title={t("card.edit")} onClick={() => setDraft(c.rule)}>
              {c.rule}
            </button>
          ) : (
            <>
              <Textarea value={draft} onChange={setDraft} rows={RULE_EDITOR_ROWS} aria-label={t("card.ruleLabel")} />
              <div style={s.editActions}>
                <Button kind="ghost" size="sm" onClick={() => setDraft(null)}>
                  {t("card.cancel")}
                </Button>
                <Button kind="primary" size="sm" onClick={save} disabled={!draft.trim()}>
                  {t("card.save")}
                </Button>
              </div>
            </>
          )}
          <div style={s.badges}>
            {c.category && <Badge>{c.category}</Badge>}
            {c.status === "accepted" && (
              <Badge icon="Check" color="var(--ok)">
                {t("card.accepted")}
              </Badge>
            )}
            {c.status === "rejected" && <Badge icon="X">{t("card.rejected")}</Badge>}
          </div>
        </div>
        <div style={s.actions}>
          <Button
            size="sm"
            icon="Check"
            kind={c.status === "accepted" ? "primary" : "secondary"}
            aria-pressed={c.status === "accepted"}
            onClick={() => onDecide(nextStatus(c.status, "accepted"))}
          >
            {t("card.accept")}
          </Button>
          <Button
            size="sm"
            icon="X"
            kind={c.status === "rejected" ? "danger" : "secondary"}
            aria-pressed={c.status === "rejected"}
            onClick={() => onDecide(nextStatus(c.status, "rejected"))}
          >
            {t("card.reject")}
          </Button>
        </div>
      </div>

      <div style={s.evidence}>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            style={s.evidenceHead}
            aria-label={t("card.openOnGitHub", { path: location })}
          >
            {location}
          </a>
        ) : (
          <span style={s.evidenceHead}>{location}</span>
        )}
        <pre style={s.snippet}>{c.evidence_snippet}</pre>
      </div>

      <div style={s.confidenceRow}>
        <div style={s.confidenceBar}>
          <ProgressBar value={confidencePercent(c.confidence)} color={confidenceColor(c.confidence)} height={6} />
        </div>
        <span style={s.confidenceText}>{t("card.confidenceValue", { percent: confidencePercent(c.confidence) })}</span>
      </div>
    </article>
  );
}
