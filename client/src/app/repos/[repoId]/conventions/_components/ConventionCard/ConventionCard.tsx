/* One convention candidate: rule, source file (GitHub deep link), verified code snippet,
   confidence bar + "seen in N files", and Accept / Reject / Edit. Edit is INLINE (rule +
   rationale fields with Save / Cancel), no navigation. Accept is a toggle: an accepted card
   is visually distinct and clicking it again returns it to pending. Reject removes the card
   (the server keeps the row so the rule is never re-proposed). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, ProgressBar, TextInput, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";
import { confidenceColor, confidencePercent, evidenceLabel } from "./helpers";
import { s } from "./styles";

export interface ConventionCardProps {
  candidate: ConventionCandidate;
  /** GitHub deep link to the evidence; null renders the path as plain text. */
  evidenceHref: string | null;
  busy?: boolean;
  onStatus: (status: ConventionStatus) => void;
  onSave: (patch: { rule: string; rationale: string | null }) => void;
}

export function ConventionCard({ candidate, evidenceHref, busy, onStatus, onSave }: ConventionCardProps) {
  const t = useTranslations("conventions.card");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(candidate.rule);
  const [rationale, setRationale] = React.useState(candidate.rationale ?? "");

  const accepted = candidate.status === "accepted";
  const pct = confidencePercent(candidate.confidence);
  const label = evidenceLabel(candidate.evidence_path, candidate.evidence_line);

  const startEdit = () => {
    setRule(candidate.rule);
    setRationale(candidate.rationale ?? "");
    setEditing(true);
  };
  const save = () => {
    const nextRule = rule.trim();
    if (!nextRule) return;
    onSave({ rule: nextRule, rationale: rationale.trim() || null });
    setEditing(false);
  };

  return (
    <article style={s.card(candidate.status)} data-status={candidate.status} aria-label={candidate.rule}>
      <div style={s.main}>
        {editing ? (
          <div style={s.editForm}>
            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("ruleLabel")}</label>
            <TextInput value={rule} onChange={setRule} aria-label={t("ruleLabel")} />
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{t("rationaleLabel")}</label>
            <Textarea value={rationale} onChange={setRationale} rows={3} />
            <div style={s.editRow}>
              <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={!rule.trim() || busy}>
                {t("save")}
              </Button>
              <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div style={s.titleRow}>
              <span style={s.rule}>{candidate.rule}</span>
              <Badge>{t(`category.${candidate.category}`)}</Badge>
            </div>
            {candidate.rationale && <p style={s.rationale}>{candidate.rationale}</p>}
          </>
        )}

        {candidate.evidence_snippet && (
          <div style={{ ...s.evidence, marginTop: editing ? 12 : 0 }}>
            <div style={s.evidenceHeader}>
              <span className="mono">{label}</span>
              {evidenceHref && (
                <a
                  href={evidenceHref}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={s.evidenceLink}
                  aria-label={t("openOnGithub", { path: label })}
                >
                  <Icon.ExternalLink size={11} />
                  {t("github")}
                </a>
              )}
            </div>
            <pre className="mono" style={s.evidenceCode}>
              {candidate.evidence_snippet}
            </pre>
          </div>
        )}

        <div style={s.metaRow}>
          <span>{t("confidence")}</span>
          <div style={s.confidenceBar}>
            <ProgressBar value={pct} color={confidenceColor(candidate.confidence)} />
          </div>
          <span className="mono" data-testid="confidence">
            {pct}%
          </span>
          <span title={candidate.evidence_files.join("\n")}>{t("seenIn", { count: candidate.occurrences })}</span>
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind="primary"
          icon="Check"
          aria-pressed={accepted}
          disabled={busy}
          onClick={() => onStatus(accepted ? "pending" : "accepted")}
          style={accepted ? { background: "var(--ok)", borderColor: "var(--ok)" } : undefined}
        >
          {accepted ? t("accepted") : t("accept")}
        </Button>
        <Button kind="ghost" icon="X" disabled={busy} onClick={() => onStatus("rejected")}>
          {t("reject")}
        </Button>
        <Button kind="ghost" icon="Edit" disabled={busy || editing} onClick={startEdit}>
          {t("edit")}
        </Button>
      </div>
    </article>
  );
}
