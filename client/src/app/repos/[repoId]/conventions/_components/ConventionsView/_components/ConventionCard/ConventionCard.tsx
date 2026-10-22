/* ConventionCard — one candidate: rule, verified evidence (linked to the scanned
   commit on GitHub), confidence and the accept / reject toggles. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, IconBtn, MonoLink, ProgressBar } from "@devdigest/ui";
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { useToast } from "@/lib/toast";
import { confidenceColor, confidencePct, evidenceLabel, nextStatus } from "./helpers";
import { s } from "./styles";

export function ConventionCard({
  candidate,
  repoFullName,
  sourceSha,
  onStatus,
}: {
  candidate: ConventionCandidate;
  repoFullName: string | null;
  sourceSha: string;
  onStatus: (status: ConventionStatus) => void;
}) {
  const t = useTranslations("conventions.card");
  const toast = useToast();
  const { status } = candidate;
  const label = evidenceLabel(candidate);
  const pct = confidencePct(candidate.confidence);
  const href =
    repoFullName && candidate.evidence_path
      ? githubBlobUrl(
          repoFullName,
          sourceSha,
          candidate.evidence_path,
          candidate.evidence_start_line ?? undefined,
          candidate.evidence_end_line ?? undefined,
        )
      : undefined;

  const copy = () => {
    if (!candidate.evidence_snippet) return;
    void navigator.clipboard?.writeText(candidate.evidence_snippet).then(() => toast.info(t("copied")));
  };

  return (
    <article style={s.card(status)} data-testid="convention-card" data-status={status}>
      <div style={s.main}>
        <div style={s.rule}>{candidate.rule}</div>
        {label ? (
          <div style={s.evidence}>
            <div style={s.evidenceHead}>
              <span className="mono" style={s.evidencePath}>
                <MonoLink href={href}>{label}</MonoLink>
              </span>
              {candidate.evidence_snippet && <IconBtn icon="Copy" label={t("copy")} onClick={copy} />}
            </div>
            {candidate.evidence_snippet && (
              <pre className="mono" style={s.snippet}>
                {candidate.evidence_snippet}
              </pre>
            )}
          </div>
        ) : (
          <span style={s.noEvidence}>{t("noEvidence")}</span>
        )}
        <div style={s.confidence}>
          <span>{t("confidence")}</span>
          <span style={s.confidenceBar}>
            <ProgressBar value={pct} color={confidenceColor(pct)} />
          </span>
          <span className="mono" style={s.confidencePct}>
            {pct}%
          </span>
        </div>
      </div>
      <div style={s.actions}>
        <Button
          kind={status === "accepted" ? "primary" : "secondary"}
          icon="Check"
          full
          aria-pressed={status === "accepted"}
          onClick={() => onStatus(nextStatus(status, "accepted"))}
        >
          {status === "accepted" ? t("accepted") : t("accept")}
        </Button>
        <Button
          kind="ghost"
          icon="X"
          full
          aria-pressed={status === "rejected"}
          onClick={() => onStatus(nextStatus(status, "rejected"))}
        >
          {status === "rejected" ? t("rejected") : t("reject")}
        </Button>
      </div>
    </article>
  );
}
