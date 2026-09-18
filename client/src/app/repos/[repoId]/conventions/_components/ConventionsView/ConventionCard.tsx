"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, MonoLink, ProgressBar } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import type { RepoProvider } from "@/lib/types";
import {
  confidenceBarColor,
  confidencePercent,
  evidenceHref,
  pathRangeLabel,
} from "./helpers";
import { s } from "./styles";

export function ConventionCard({
  item,
  selected,
  provider,
  fullName,
  gitRef,
  patching,
  onToggleSelect,
  onAccept,
  onReject,
  onSaveRule,
}: {
  item: ConventionCandidate;
  selected: boolean;
  provider: RepoProvider;
  fullName: string;
  gitRef: string;
  patching: boolean;
  onToggleSelect: () => void;
  onAccept: () => void;
  onReject: () => void;
  onSaveRule: (rule: string) => void;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(item.rule);
  const pct = confidencePercent(item.confidence);
  const href = evidenceHref(
    provider,
    fullName,
    gitRef,
    item.evidence_path,
    item.evidence_start_line,
    item.evidence_end_line,
  );
  const rejected = item.status === "rejected";
  const accepted = item.status === "accepted";

  const commitRule = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== item.rule) onSaveRule(next);
    else setDraft(item.rule);
  };

  return (
    <article
      style={s.card(accepted, rejected)}
      data-selected={selected ? "true" : "false"}
      onClick={() => {
        if (accepted) onToggleSelect();
      }}
    >
      <div style={s.cardMain}>
        {editing ? (
          <input
            aria-label={t("card.editRule")}
            style={s.titleInput}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRule}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRule();
              if (e.key === "Escape") {
                setDraft(item.rule);
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <h2
            style={s.title}
            onClick={(e) => {
              e.stopPropagation();
              setDraft(item.rule);
              setEditing(true);
            }}
          >
            {item.rule}
          </h2>
        )}
        <div style={s.evidenceRow} onClick={(e) => e.stopPropagation()}>
          <MonoLink href={href}>
            {pathRangeLabel(item.evidence_path, item.evidence_start_line, item.evidence_end_line)}
          </MonoLink>
          <a href={href} target="_blank" rel="noreferrer" aria-label={t("card.openEvidence")}>
            <Icon.ExternalLink size={14} />
          </a>
        </div>
        <pre style={s.snippet}>{item.evidence_snippet}</pre>
        <div style={s.confidence}>
          <span>{t("card.confidence")}</span>
          <div style={s.confBar}>
            <ProgressBar value={pct} color={confidenceBarColor(pct)} height={5} />
          </div>
          <span>{pct}%</span>
        </div>
      </div>
      <div style={s.cardActions} onClick={(e) => e.stopPropagation()}>
        <Button
          kind={accepted ? "primary" : "secondary"}
          size="sm"
          icon="Check"
          disabled={patching}
          onClick={onAccept}
        >
          {t("card.accepted")}
        </Button>
        <Button kind="ghost" size="sm" icon="X" disabled={patching} onClick={onReject}>
          {t("card.reject")}
        </Button>
      </div>
    </article>
  );
}
