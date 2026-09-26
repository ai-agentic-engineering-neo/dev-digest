"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, ProgressBar, TextInput } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { confidenceColor } from "../../helpers";
import { s } from "./styles";

export function ConventionCard({
  candidate,
  repoFullName,
  sha,
  onAccept,
  onReject,
  onEdit,
  accepting,
  rejecting,
}: {
  candidate: ConventionCandidate;
  repoFullName: string;
  sha: string | null;
  onAccept: () => void;
  onReject: () => void;
  onEdit: (patch: { rule?: string; category?: string }) => void;
  accepting?: boolean;
  rejecting?: boolean;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(candidate.rule);
  const [category, setCategory] = React.useState(candidate.category ?? "");
  const accepted = candidate.status === "accepted";

  const location = `${candidate.evidence_path}:${candidate.evidence_start_line}-${candidate.evidence_end_line}`;
  const href = sha
    ? githubBlobUrl(repoFullName, sha, candidate.evidence_path, candidate.evidence_start_line, candidate.evidence_end_line)
    : null;

  const save = () => {
    onEdit({ rule, category: category || undefined });
    setEditing(false);
  };
  const cancel = () => {
    setRule(candidate.rule);
    setCategory(candidate.category ?? "");
    setEditing(false);
  };

  return (
    <div style={s.card(accepted)}>
      {editing ? (
        <>
          <div style={s.editFieldsRow}>
            <TextInput value={category} onChange={setCategory} placeholder={t("card.categoryPlaceholder")} />
            <TextInput value={rule} onChange={setRule} placeholder={t("card.rulePlaceholder")} />
          </div>
          <div style={s.actionsRow}>
            <Button kind="primary" size="sm" onClick={save} disabled={!rule.trim()}>
              {t("card.save")}
            </Button>
            <Button kind="ghost" size="sm" onClick={cancel}>
              {t("card.cancel")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div style={s.headerRow}>
            {candidate.category && <Badge color="var(--accent)" bg="var(--accent-bg)">{candidate.category}</Badge>}
            <span style={s.ruleText}>{candidate.rule}</span>
          </div>
          <div style={s.metaRow}>
            {href ? (
              <a href={href} target="_blank" rel="noreferrer" style={s.sourceLink}>
                {t("card.detectedIn", { location })}
              </a>
            ) : (
              <span style={s.sourceLink}>{t("card.detectedIn", { location })}</span>
            )}
            <div style={s.confidenceWrap}>
              <span style={s.confidenceLabel}>{t("card.confidence")}</span>
              <ProgressBar value={candidate.confidence * 100} color={confidenceColor(candidate.confidence)} height={5} />
            </div>
          </div>
          <pre style={s.snippet}>{candidate.evidence_snippet}</pre>
          <div style={s.actionsRow}>
            {accepted ? (
              <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check">
                {t("card.accepted")}
              </Badge>
            ) : (
              <>
                <Button kind="primary" size="sm" icon="Check" onClick={onAccept} loading={accepting}>
                  {accepting ? t("card.accepting") : t("card.acceptAsSkill")}
                </Button>
                <Button kind="secondary" size="sm" icon="X" onClick={onReject} loading={rejecting}>
                  {rejecting ? t("card.rejecting") : t("card.reject")}
                </Button>
              </>
            )}
            <Button kind="ghost" size="sm" icon="Edit" onClick={() => setEditing(true)}>
              {t("card.edit")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
