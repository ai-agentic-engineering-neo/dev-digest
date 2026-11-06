/* IntentCard — presentational view of the derived/edited PR intent. */
"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import { RunCostBadge } from "@/components/run-cost-badge";
import type { IntentOverrideInput, PrIntent } from "@/lib/types";
import { confidenceTone, shortSha } from "./helpers";
import { SourceChips } from "./_components/SourceChips";
import { IntentEditForm } from "./_components/IntentEditForm";
import { s } from "./styles";

export interface IntentCardActions {
  onRefresh: () => void;
  /** Rejects on API error (the global toast has already been shown). */
  onSaveOverride: (input: IntentOverrideInput) => Promise<void>;
  onResetOverride: () => void;
  refreshing: boolean;
  saving: boolean;
  resetting: boolean;
}

function ScopeList({ heading, items }: { heading: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={s.scopeCol}>
      <h4 style={s.scopeHeading}>{heading}</h4>
      <ul style={s.list}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function IntentCard({
  intent,
  repoFullName,
  actions,
}: {
  intent: PrIntent;
  repoFullName: string | null;
  actions: IntentCardActions;
}) {
  const t = useTranslations("brief");
  const [editing, setEditing] = useState(false);

  const isUser = intent.origin === "user";
  const tone = confidenceTone(intent.confidence);
  const hint =
    t(`intent.confidenceHint.${intent.confidence_reason}`) +
    (intent.confidence_lowered ? ` ${t("intent.confidenceHint.lowered")}` : "");
  const sha = shortSha(intent.head_sha);

  const refreshButton = (
    <Button kind="secondary" size="sm" icon="RefreshCw" disabled={actions.refreshing} onClick={actions.onRefresh}>
      {actions.refreshing ? t("intent.actions.refreshing") : t("intent.actions.refresh")}
    </Button>
  );

  if (intent.status === "failed" && intent.intent === null) {
    return (
      <section style={s.wrap}>
        <h3 style={s.title}>{t("block.intent")}</h3>
        <p style={s.failed}>{t("intent.failed", { error: intent.error ?? "" })}</p>
        <div style={s.actions}>{refreshButton}</div>
      </section>
    );
  }

  async function handleSave(input: IntentOverrideInput) {
    try {
      await actions.onSaveOverride(input);
      setEditing(false);
    } catch {
      // Keep the form open; the global mutation toast already reported the error.
    }
  }

  return (
    <section style={s.wrap}>
      <div style={s.header}>
        <h3 style={s.title}>{t("block.intent")}</h3>
        <Badge>{t(`intent.kind.${intent.kind}`)}</Badge>
        <span title={hint}>
          <Badge color={tone.color} bg={tone.bg}>
            {t(`intent.confidence.${intent.confidence}`)}
          </Badge>
        </span>
        {isUser && <Badge>{t("intent.edited")}</Badge>}
      </div>

      {intent.stale && intent.stale_reason && (
        <div role="status" style={s.stale}>
          <span>{t(`intent.stale.${intent.stale_reason}`)}</span>
        </div>
      )}

      {editing ? (
        <IntentEditForm
          initial={{
            intent: intent.intent ?? "",
            in_scope: intent.in_scope,
            out_of_scope: intent.out_of_scope,
          }}
          saving={actions.saving}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          {intent.intent && <p style={s.intent}>{intent.intent}</p>}
          {(intent.in_scope.length > 0 || intent.out_of_scope.length > 0) && (
            <div style={s.scopeRow}>
              <ScopeList heading={t("intent.inScope")} items={intent.in_scope} />
              <ScopeList heading={t("intent.outOfScope")} items={intent.out_of_scope} />
            </div>
          )}
        </>
      )}

      <SourceChips sources={intent.sources} repoFullName={repoFullName} />

      <div style={s.meta}>
        {intent.model && <span>{t("intent.meta.model", { model: intent.model })}</span>}
        <RunCostBadge
          variant="detailed"
          costUsd={intent.cost_usd}
          tokensIn={intent.tokens_in}
          tokensOut={intent.tokens_out}
          tokenUnit={t("intent.meta.tokenUnit")}
        />
        {sha && <span>{t("intent.meta.computedFor", { sha })}</span>}
      </div>

      {!editing && (
        <div style={s.actions}>
          {!isUser && refreshButton}
          <Button kind="ghost" size="sm" onClick={() => setEditing(true)}>
            {t("intent.actions.edit")}
          </Button>
          {isUser && (
            <Button kind="ghost" size="sm" disabled={actions.resetting} onClick={actions.onResetOverride}>
              {t("intent.actions.reset")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

export default IntentCard;
