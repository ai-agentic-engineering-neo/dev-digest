/* ConventionCard — one extracted candidate: rule, evidence (clickable to the
   real file:line on GitHub, pinned to the scan's commit sha), confidence,
   and accept/reject. Evidence is never faked: a candidate only reaches this
   card because the server already verified the snippet against the clone. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, MonoLink, ProgressBar } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

export function ConventionCard({
  candidate,
  repoFullName,
  sourceSha,
  onAccept,
  onReject,
  pending,
}: {
  candidate: ConventionCandidate;
  repoFullName: string | null;
  sourceSha: string | null;
  onAccept: () => void;
  onReject: () => void;
  pending?: boolean;
}) {
  const t = useTranslations("conventions");
  const evidenceUrl =
    repoFullName && sourceSha && candidate.evidence_path
      ? githubBlobUrl(
          repoFullName,
          sourceSha,
          candidate.evidence_path,
          candidate.evidence_start_line ?? undefined,
          candidate.evidence_end_line ?? undefined,
        )
      : null;
  const lineRange =
    candidate.evidence_start_line != null
      ? candidate.evidence_start_line === candidate.evidence_end_line
        ? `:${candidate.evidence_start_line}`
        : `:${candidate.evidence_start_line}-${candidate.evidence_end_line}`
      : "";

  return (
    <div style={s.card(candidate.status)}>
      <div style={s.topRow}>
        <div style={s.body}>
          <div style={s.rule}>{candidate.rule}</div>
          <div style={s.categoryBadgeRow}>
            <Badge color="var(--text-muted)">{candidate.category}</Badge>
            {candidate.status === "accepted" && (
              <Badge color="var(--ok)" icon="Check">
                {t("card.accepted")}
              </Badge>
            )}
            {candidate.status === "rejected" && (
              <Badge color="var(--text-muted)" icon="X">
                {t("card.rejected")}
              </Badge>
            )}
          </div>
        </div>
        <div style={s.actions}>
          <Button
            kind={candidate.status === "accepted" ? "primary" : "secondary"}
            size="sm"
            icon="Check"
            disabled={pending}
            onClick={onAccept}
          >
            {t("card.accept")}
          </Button>
          <Button
            kind={candidate.status === "rejected" ? "danger" : "ghost"}
            size="sm"
            icon="X"
            disabled={pending}
            onClick={onReject}
          >
            {t("card.reject")}
          </Button>
        </div>
      </div>

      {candidate.evidence_path && (
        <div style={s.evidenceBlock}>
          <div style={s.evidenceHeader}>
            {evidenceUrl ? (
              <MonoLink href={evidenceUrl}>
                {candidate.evidence_path}
                {lineRange}
              </MonoLink>
            ) : (
              <span className="mono">
                {candidate.evidence_path}
                {lineRange}
              </span>
            )}
          </div>
          {candidate.evidence_snippet && (
            <pre className="mono" style={s.evidenceCode}>
              {candidate.evidence_snippet}
            </pre>
          )}
        </div>
      )}

      {!candidate.evidence_path && <div style={s.confidenceLabel}>{t("card.noEvidence")}</div>}

      {candidate.confidence != null && (
        <div style={s.confidenceRow}>
          <div style={s.confidenceBarWrap}>
            <ProgressBar value={Math.round(candidate.confidence * 100)} />
          </div>
          <span className="tnum" style={s.confidenceLabel}>
            {t("card.confidence", { pct: Math.round(candidate.confidence * 100) })}
          </span>
        </div>
      )}
    </div>
  );
}
