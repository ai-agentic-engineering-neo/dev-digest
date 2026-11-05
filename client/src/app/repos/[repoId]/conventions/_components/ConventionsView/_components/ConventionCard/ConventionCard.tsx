/* ConventionCard — one extracted house-rule (Conventions design): the rule
   (inline-editable), its verified evidence `path:lines` + real code with a copy
   button, the confidence bar, and Accept / Reject on the right. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, ProgressBar, TextInput } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { confidenceColor, evidenceRef, nextStatusOnAccept, nextStatusOnReject } from "../../helpers";
import { s } from "./styles";

export function ConventionCard({
  convention: c,
  onStatus,
  onRule,
  onCopied,
}: {
  convention: ConventionCandidate;
  onStatus: (status: ConventionCandidate["status"]) => void;
  onRule: (rule: string) => void;
  onCopied: () => void;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(c.rule);
  const ref = evidenceRef(c);
  const pct = Math.round(c.confidence * 100);

  const saveRule = () => {
    const next = draft.trim();
    if (next && next !== c.rule) onRule(next);
    setEditing(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${ref}\n${c.evidence_snippet}`);
      onCopied();
    } catch {
      /* clipboard unavailable (insecure context) — nothing to do */
    }
  };

  return (
    <div style={s.card(c.status)} data-testid={`convention-${c.id}`}>
      <div style={s.main}>
        {editing ? (
          <div style={s.editRow}>
            <div style={s.editInput}>
              <TextInput
                value={draft}
                onChange={setDraft}
                aria-label={t("card.editLabel")}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRule();
                  if (e.key === "Escape") setEditing(false);
                }}
              />
            </div>
            <Button kind="primary" size="sm" onClick={saveRule} disabled={!draft.trim()}>
              {t("card.save")}
            </Button>
            <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
              {t("card.cancel")}
            </Button>
          </div>
        ) : (
          <div style={s.ruleRow}>
            <div style={s.rule}>
              {c.rule}
              {c.category && <div style={s.category}>{c.category}</div>}
            </div>
            <button
              type="button"
              style={s.copyBtn}
              aria-label={t("card.edit")}
              title={t("card.edit")}
              onClick={() => {
                setDraft(c.rule);
                setEditing(true);
              }}
            >
              <Icon.Edit size={14} />
            </button>
          </div>
        )}

        <div style={s.code}>
          <div style={s.codeHead}>
            <span className="mono" style={s.codePath}>
              {ref}
            </span>
            <button type="button" style={s.copyBtn} aria-label={t("card.copy")} title={t("card.copy")} onClick={copy}>
              <Icon.Copy size={14} />
            </button>
          </div>
          <pre className="mono" style={s.pre}>
            {c.evidence_snippet}
          </pre>
        </div>

        <div style={s.confRow}>
          <span>{t("card.confidence")}</span>
          <div style={s.confBar}>
            <ProgressBar value={pct} color={confidenceColor(c.confidence)} />
          </div>
          <span style={s.confNum}>{pct}%</span>
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind={c.status === "accepted" ? "primary" : "secondary"}
          icon="Check"
          full
          aria-pressed={c.status === "accepted"}
          onClick={() => onStatus(nextStatusOnAccept(c))}
        >
          {c.status === "accepted" ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button
          kind="ghost"
          icon={c.status === "rejected" ? "RefreshCw" : "X"}
          full
          aria-pressed={c.status === "rejected"}
          onClick={() => onStatus(nextStatusOnReject(c))}
        >
          {c.status === "rejected" ? t("card.undo") : t("card.reject")}
        </Button>
      </div>
    </div>
  );
}
