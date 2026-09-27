/* CandidateCard — one proposed house rule: what it says, the code it was learned
   from, how sure the model was, and the three decisions a reviewer can make.
   Edit works in place: leaving the page to change one sentence would lose the
   context that makes the sentence judgeable. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, IconBtn, SelectInput, TextInput } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { CONVENTION_CATEGORIES } from "../../constants";
import { confidenceColor, confidencePct, evidenceRef } from "../../helpers";
import { s } from "./styles";

export function CandidateCard({
  candidate,
  repoFullName,
  busy,
  onStatus,
  onEdit,
  onOpenSkill,
}: {
  candidate: ConventionCandidate;
  repoFullName?: string | null;
  busy?: boolean;
  onStatus: (status: ConventionCandidate["status"]) => void;
  onEdit: (patch: { rule: string; category: ConventionCategory }) => void;
  onOpenSkill?: (skillId: string) => void;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(candidate.rule);
  const [category, setCategory] = React.useState<ConventionCategory>(candidate.category);

  // A re-scan can replace the row under an open editor; re-seed the draft when
  // the saved values move, so Save never writes text the user cannot see.
  React.useEffect(() => {
    setRule(candidate.rule);
    setCategory(candidate.category);
  }, [candidate.rule, candidate.category]);

  const pct = confidencePct(candidate.confidence);
  const ref = evidenceRef(candidate);
  // The link is pinned to the commit that was scanned: on `main` the line
  // numbers drift with the next push, and a citation that points at the wrong
  // line is worse than no link.
  const href =
    repoFullName && candidate.evidence_sha
      ? githubBlobUrl(
          repoFullName,
          candidate.evidence_sha,
          candidate.evidence_path,
          candidate.evidence_line_start ?? undefined,
          candidate.evidence_line_end ?? undefined,
        )
      : null;

  const save = () => {
    const trimmed = rule.trim();
    if (!trimmed) return;
    onEdit({ rule: trimmed, category });
    setEditing(false);
  };

  const cancel = () => {
    setRule(candidate.rule);
    setCategory(candidate.category);
    setEditing(false);
  };

  return (
    <div style={s.card(candidate.status)} data-testid="convention-candidate">
      <div style={s.main}>
        {editing ? (
          <div style={s.editRow}>
            <TextInput
              value={rule}
              onChange={setRule}
              placeholder={t("card.rulePlaceholder")}
              aria-label={t("card.ruleLabel")}
            />
            <div style={s.editControls}>
              <SelectInput
                value={category}
                onChange={(v) => setCategory(v as ConventionCategory)}
                options={CONVENTION_CATEGORIES.map((c) => ({
                  value: c,
                  label: t(`category.${c}`),
                }))}
              />
              <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={!rule.trim()}>
                {t("card.save")}
              </Button>
              <Button kind="ghost" size="sm" onClick={cancel}>
                {t("card.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div style={s.titleRow}>
              <h3 style={s.rule}>{candidate.rule}</h3>
              <Badge color="var(--text-muted)">{t(`category.${candidate.category}`)}</Badge>
            </div>

            {/* The snippet below is ONE occurrence; the rationale is where the
                model says how widespread the pattern is. */}
            {candidate.rationale && (
              <p style={s.rationale}>
                <span style={s.rationaleLabel}>{t("card.why")}</span> {candidate.rationale}
              </p>
            )}

            <div style={s.evidenceBox}>
              <div style={s.evidenceHead}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="mono"
                    style={s.evidenceLink}
                    title={t("card.openOnGitHub")}
                  >
                    {ref}
                    <Icon.ExternalLink size={12} />
                  </a>
                ) : (
                  <span className="mono" style={s.evidencePlain}>
                    {ref}
                  </span>
                )}
                <IconBtn
                  icon="Copy"
                  label={t("card.copy")}
                  onClick={() => navigator.clipboard?.writeText(candidate.evidence_snippet)}
                />
              </div>
              <pre style={s.snippet}>{candidate.evidence_snippet}</pre>
            </div>

            <div style={s.confidenceRow}>
              <span style={s.confidenceLabel}>{t("card.confidence")}</span>
              <span style={s.bar}>
                <span style={s.barFill(pct, confidenceColor(candidate.confidence))} />
              </span>
              <span style={s.pct}>{t("card.confidencePct", { pct })}</span>
              {candidate.skill_id && (
                <button
                  type="button"
                  style={s.skillBadge}
                  onClick={() => onOpenSkill?.(candidate.skill_id!)}
                >
                  <Icon.Sparkles size={12} />
                  {t("card.inSkill")}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div style={s.actions}>
        {candidate.status === "rejected" ? (
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            disabled={busy}
            onClick={() => onStatus("pending")}
          >
            {t("card.restore")}
          </Button>
        ) : (
          <>
            <Button
              kind={candidate.status === "accepted" ? "primary" : "secondary"}
              size="sm"
              icon="Check"
              disabled={busy}
              // A second click on Accept puts the card back in play: a decision
              // you cannot take back is not a decision, it is a trap.
              onClick={() => onStatus(candidate.status === "accepted" ? "pending" : "accepted")}
            >
              {candidate.status === "accepted" ? t("card.accepted") : t("card.accept")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              disabled={busy}
              onClick={() => onStatus("rejected")}
            >
              {t("card.reject")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="Edit"
              disabled={busy || editing}
              onClick={() => setEditing(true)}
            >
              {t("card.edit")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
