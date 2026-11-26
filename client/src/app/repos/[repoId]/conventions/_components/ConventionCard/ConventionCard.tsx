/* ConventionCard — one extracted house-rule: the rule, its verified evidence
   (path:lines + GitHub deep-link pinned to the row's own scan SHA + copy), the
   counter-example, confidence, and Accept ↔ Reject (no way back to pending) + Edit. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox, IconBtn, ProgressBar } from "@devdigest/ui";
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { useToast } from "@/lib/toast";
import {
  categoryOf,
  confidenceColor,
  evidenceLabel,
  evidenceOf,
  hasLines,
  nextStatus,
  refFor,
  statusOf,
} from "../../helpers";
import { s } from "./styles";

export interface ConventionCardProps {
  candidate: ConventionCandidate;
  repoFullName: string | null;
  commitSha: string | null;
  selected: boolean;
  busy?: boolean;
  onToggleSelect: () => void;
  onStatus: (status: Exclude<ConventionStatus, "pending">) => void;
  onEdit: () => void;
}

export function ConventionCard({
  candidate: c,
  repoFullName,
  commitSha,
  selected,
  busy,
  onToggleSelect,
  onStatus,
  onEdit,
}: ConventionCardProps) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const status = statusOf(c);
  const accepted = status === "accepted";
  const rejected = status === "rejected";
  const choose = (clicked: "accepted" | "rejected") => {
    const next = nextStatus(status, clicked);
    if (next) onStatus(next);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("card.copied"));
    } catch {
      // Clipboard blocked (insecure context) — nothing useful to report.
    }
  };

  return (
    <article style={s.card(rejected, accepted)} aria-label={c.rule}>
      {/* Only accepted rules can go into a skill, so only they are selectable. */}
      <div style={s.select}>
        {accepted && (
          <Checkbox
            checked={selected}
            onChange={onToggleSelect}
            label={<span style={s.srOnly}>{t("card.select")}</span>}
          />
        )}
      </div>

      <div style={s.main}>
        <div style={s.titleRow}>
          <span style={s.rule}>{c.rule}</span>
          <Badge>{t(`card.categories.${categoryOf(c)}`)}</Badge>
          {(c.skill_names ?? []).map((name) => (
            <Badge key={name} icon="Sparkles" color="var(--accent)">
              {t("card.inSkill", { name })}
            </Badge>
          ))}
        </div>

        {evidenceOf(c).map((e) => (
          <div key={`${e.path}:${e.line_start}`} style={s.evidence}>
            <div style={s.evidenceHead}>
              <span style={s.path} title={evidenceLabel(e)}>
                {evidenceLabel(e)}
              </span>
              {repoFullName && (
                <a
                  style={s.github}
                  href={
                    hasLines(e)
                      ? githubBlobUrl(repoFullName, refFor(commitSha), e.path, e.line_start, e.line_end)
                      : githubBlobUrl(repoFullName, refFor(commitSha), e.path)
                  }
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  ↗ {t("card.github")}
                </a>
              )}
              <IconBtn icon="Copy" label={t("card.copy")} size={13} onClick={() => copy(e.snippet)} />
            </div>
            <pre style={s.code}>{e.snippet}</pre>
          </div>
        ))}

        {c.bad_example && (
          <div style={s.evidence}>
            <div style={s.evidenceHead}>
              <span style={s.badLabel}>✕ {t("card.badExample")}</span>
            </div>
            <pre style={s.code}>{c.bad_example}</pre>
          </div>
        )}

        <div style={s.confidenceRow}>
          <span>{t("card.confidence")}</span>
          <div style={s.bar}>
            <ProgressBar value={c.confidence * 100} color={confidenceColor(c.confidence)} />
          </div>
          <span>{Math.round(c.confidence * 100)}%</span>
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind={accepted ? "primary" : "secondary"}
          size="sm"
          icon="Check"
          active={accepted}
          disabled={busy}
          aria-pressed={accepted}
          onClick={() => choose("accepted")}
        >
          {accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button
          kind={rejected ? "danger" : "ghost"}
          size="sm"
          icon="X"
          disabled={busy}
          aria-pressed={rejected}
          onClick={() => choose("rejected")}
        >
          {rejected ? t("card.rejected") : t("card.reject")}
        </Button>
        <Button kind="ghost" size="sm" icon="Edit" disabled={busy} onClick={onEdit}>
          {t("card.edit")}
        </Button>
      </div>
    </article>
  );
}
