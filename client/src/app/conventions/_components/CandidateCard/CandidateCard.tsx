/* CandidateCard — one extracted convention: rule, evidence file:line + snippet,
   confidence bar, Accept / Reject buttons and an inline Edit form. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, IconBtn, ProgressBar, SelectInput, TextInput } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";
import type { ConventionPatch } from "../../../../lib/hooks/conventions";
import { CATEGORY_VALUES } from "./constants";
import { s } from "./styles";

export function CandidateCard({
  candidate,
  onChange,
  pending,
}: {
  candidate: ConventionCandidate;
  onChange: (patch: ConventionPatch) => void;
  pending?: boolean;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(candidate.rule);
  const [category, setCategory] = React.useState<ConventionCategory>(candidate.category);
  const [copied, setCopied] = React.useState(false);
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);
  const pct = Math.round(candidate.confidence * 100);
  const color = pct >= 80 ? "var(--ok)" : pct >= 60 ? "var(--warn)" : "var(--crit)";
  const location = `${candidate.evidence_path}:${candidate.evidence_line}`;
  const categoryOptions = CATEGORY_VALUES.map((v) => ({ value: v, label: t(`card.category.${v}`) }));

  const startEdit = () => {
    setRule(candidate.rule);
    setCategory(candidate.category);
    setEditing(true);
  };
  const saveEdit = () => {
    onChange({ rule: rule.trim(), category });
    setEditing(false);
  };
  const copy = () => {
    void navigator.clipboard?.writeText(location);
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div style={s.card(candidate.status)} data-testid="convention-card" data-status={candidate.status}>
      <div style={s.main}>
        {editing ? (
          <div style={s.editForm}>
            <FormField label={t("card.ruleLabel")} required>
              <TextInput value={rule} onChange={setRule} />
            </FormField>
            <div style={s.editRow}>
              <FormField label={t("card.categoryLabel")}>
                <SelectInput value={category} onChange={(v) => setCategory(v as ConventionCategory)} options={categoryOptions} />
              </FormField>
              <Button kind="primary" size="sm" icon="Check" onClick={saveEdit} disabled={!rule.trim()}>
                {t("card.save")}
              </Button>
              <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
                {t("card.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div style={s.ruleRow}>
            <span style={s.rule}>{candidate.rule}</span>
            <Badge>{t(`card.category.${candidate.category}`)}</Badge>
          </div>
        )}
        <div style={s.evidence}>
          <div style={s.evidenceHead}>
            <span className="mono">{location}</span>
            <span style={{ marginLeft: "auto" }}>
              <IconBtn icon={copied ? "Check" : "Copy"} size={22} label={copied ? t("card.copied") : t("card.copyEvidence")} onClick={copy} />
            </span>
          </div>
          <pre className="mono" style={s.snippet}>
            {candidate.evidence_snippet}
          </pre>
        </div>
        <div style={s.confidenceRow}>
          <span>{t("card.confidence")}</span>
          <span style={s.bar}>
            <ProgressBar value={pct} color={color} />
          </span>
          <span>{pct}%</span>
        </div>
      </div>
      <div style={s.actions}>
        {candidate.status === "rejected" ? (
          <Button kind="secondary" size="sm" icon="RefreshCw" onClick={() => onChange({ status: "candidate" })} disabled={pending}>
            {t("card.unreject")}
          </Button>
        ) : (
          <>
            <Button
              kind={candidate.status === "accepted" ? "primary" : "secondary"}
              size="sm"
              icon="Check"
              onClick={() => onChange({ status: candidate.status === "accepted" ? "candidate" : "accepted" })}
              disabled={pending}
              aria-pressed={candidate.status === "accepted"}
            >
              {candidate.status === "accepted" ? t("card.accepted") : t("card.accept")}
            </Button>
            <Button kind="secondary" size="sm" icon="X" onClick={() => onChange({ status: "rejected" })} disabled={pending}>
              {t("card.reject")}
            </Button>
            {!editing && (
              <Button kind="ghost" size="sm" icon="Edit" onClick={startEdit} disabled={pending}>
                {t("card.edit")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
