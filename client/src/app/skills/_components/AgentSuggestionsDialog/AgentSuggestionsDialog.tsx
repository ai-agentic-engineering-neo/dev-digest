/* AgentSuggestionsDialog — after a skill is created (or conventions merged into
   it), the enabled agents that may want it, each with its reasons and an
   Accept / Reject toggle (high scores start on Accept). One confirm links every
   accepted agent; nothing is written before it. Renders nothing while loading,
   on error or when no agent fits (then it closes itself). Skip / X / backdrop
   close it, except while links are in flight (cf. MergeConflictsDialog, which
   has no onClose because its state would be lost). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Modal } from "@devdigest/ui";
import type { AgentSuggestion, AgentSuggestionReason, Skill } from "@devdigest/shared";
import { DECISIONS, decisionOf, type Decision, type LinkOutcome } from "./helpers";
import { useAgentSuggestionsDialog } from "./useAgentSuggestionsDialog";
import { s } from "./styles";

export interface AgentSuggestionsDialogProps {
  skill: Pick<Skill, "id" | "enabled">;
  onClose: () => void;
}

export function AgentSuggestionsDialog({ skill, onClose }: AgentSuggestionsDialogProps) {
  const t = useTranslations("skills");
  const d = useAgentSuggestionsDialog(skill.id, onClose);
  if (d.list.length === 0) return null;

  return (
    <Modal
      width={640}
      title={t("suggestions.title")}
      subtitle={t("suggestions.subtitle")}
      onClose={d.dismiss}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose} disabled={d.busy}>
            {t("suggestions.skip")}
          </Button>
          <Button kind="primary" icon="Check" onClick={d.confirm} disabled={d.busy || d.toLink.length === 0}>
            {d.busy
              ? t("suggestions.linking")
              : d.hasFailures
                ? t("suggestions.retry", { count: d.toLink.length })
                : t("suggestions.link", { count: d.toLink.length })}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {!skill.enabled && <p style={s.note}>{t("suggestions.disabledNote")}</p>}
        <ul style={s.list}>
          {d.list.map((sug) => (
            <SuggestionRow
              key={sug.agent_id}
              suggestion={sug}
              decision={decisionOf(sug, d.overrides)}
              outcome={d.outcomes[sug.agent_id]}
              disabled={d.busy}
              onDecide={(next) => d.decide(sug.agent_id, next)}
            />
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function SuggestionRow({
  suggestion,
  decision,
  outcome,
  disabled,
  onDecide,
}: {
  suggestion: AgentSuggestion;
  decision: Decision;
  outcome: LinkOutcome | undefined;
  disabled: boolean;
  onDecide: (d: Decision) => void;
}) {
  const t = useTranslations("skills");
  const linked = outcome === "linked";
  return (
    <li style={s.item} aria-label={suggestion.agent_name}>
      <div style={s.main}>
        <div style={s.head}>
          <span style={s.name}>{suggestion.agent_name}</span>
          <span style={s.score}>{t("suggestions.score", { score: suggestion.score })}</span>
        </div>
        <ul style={s.reasons}>
          {suggestion.reasons.map((r) => (
            <li key={r.kind}>
              <ReasonText reason={r} />
            </li>
          ))}
        </ul>
      </div>
      <div style={s.side}>
        {outcome === "failed" && <span style={s.failed}>{t("suggestions.failed")}</span>}
        {linked ? (
          <Badge icon="Check" color="var(--ok)">
            {t("suggestions.linked")}
          </Badge>
        ) : (
          <div role="radiogroup" aria-label={t("suggestions.decision", { name: suggestion.agent_name })} style={s.side}>
            {DECISIONS.map((option) => (
              <Button
                key={option}
                size="sm"
                kind={decision === option ? "primary" : "ghost"}
                role="radio"
                aria-checked={decision === option}
                disabled={disabled}
                onClick={() => onDecide(option)}
              >
                {t(`suggestions.${option}`)}
              </Button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function ReasonText({ reason }: { reason: AgentSuggestionReason }) {
  const t = useTranslations("skills");
  switch (reason.kind) {
    case "category":
      return t("suggestions.reasons.category", {
        categories: reason.categories.map((c) => t(`suggestions.categories.${c}`)).join(", "),
      });
    case "type":
      return t("suggestions.reasons.type", { count: reason.count, type: t(`listItem.type.${reason.type}`) });
    case "keywords":
      return t("suggestions.reasons.keywords", { keywords: reason.keywords.join(", ") });
  }
}
