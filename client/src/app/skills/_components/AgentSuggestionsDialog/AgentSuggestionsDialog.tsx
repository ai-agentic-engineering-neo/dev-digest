/* AgentSuggestionsDialog — after a skill is created (or conventions merged into
   it), the enabled agents that may want it, each with its reasons and two
   buttons that act at once: Accept links the skill to that agent (the row then
   says "Linked"), Reject removes the row. High scores carry a "Recommended"
   badge. It closes itself when every row is decided; Done / X / backdrop close
   it too, except while a link is in flight. Renders nothing while loading, on
   error or when no agent fits (then it closes itself). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Modal } from "@devdigest/ui";
import type { AgentSuggestion, AgentSuggestionReason, Skill } from "@devdigest/shared";
import type { RowState } from "./helpers";
import { useAgentSuggestionsDialog } from "./useAgentSuggestionsDialog";
import { s } from "./styles";

export interface AgentSuggestionsDialogProps {
  skill: Pick<Skill, "id" | "enabled">;
  onClose: () => void;
}

export function AgentSuggestionsDialog({ skill, onClose }: AgentSuggestionsDialogProps) {
  const t = useTranslations("skills");
  const d = useAgentSuggestionsDialog(skill.id, onClose);
  if (d.visible.length === 0) return null;

  return (
    <Modal
      width={640}
      title={t("suggestions.title")}
      subtitle={t("suggestions.subtitle")}
      onClose={d.dismiss}
      footer={
        <div style={s.footer}>
          <Button kind="primary" onClick={d.dismiss} disabled={d.busy}>
            {t("suggestions.done")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {!skill.enabled && <p style={s.note}>{t("suggestions.disabledNote")}</p>}
        <ul style={s.list}>
          {d.visible.map((sug) => (
            <SuggestionRow
              key={sug.agent_id}
              suggestion={sug}
              state={d.states[sug.agent_id]}
              onAccept={() => void d.accept(sug.agent_id)}
              onReject={() => d.reject(sug.agent_id)}
            />
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function SuggestionRow({
  suggestion,
  state,
  onAccept,
  onReject,
}: {
  suggestion: AgentSuggestion;
  state: RowState | undefined;
  onAccept: () => void;
  onReject: () => void;
}) {
  const t = useTranslations("skills");
  const linking = state === "linking";
  return (
    <li style={s.item} aria-label={suggestion.agent_name}>
      <div style={s.main}>
        <div style={s.head}>
          <span style={s.name}>{suggestion.agent_name}</span>
          <span style={s.score}>{t("suggestions.score", { score: suggestion.score })}</span>
          {suggestion.preselected && <Badge color="var(--accent)">{t("suggestions.recommended")}</Badge>}
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
        {state === "failed" && <span style={s.failed}>{t("suggestions.failed")}</span>}
        {state === "linked" ? (
          <Badge icon="Check" color="var(--ok)">
            {t("suggestions.linked")}
          </Badge>
        ) : (
          <div role="group" aria-label={t("suggestions.decision", { name: suggestion.agent_name })} style={s.side}>
            <Button size="sm" kind="primary" icon="Check" disabled={linking} onClick={onAccept}>
              {linking ? t("suggestions.linking") : t("suggestions.accept")}
            </Button>
            <Button size="sm" kind="ghost" icon="X" disabled={linking} onClick={onReject}>
              {t("suggestions.reject")}
            </Button>
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
