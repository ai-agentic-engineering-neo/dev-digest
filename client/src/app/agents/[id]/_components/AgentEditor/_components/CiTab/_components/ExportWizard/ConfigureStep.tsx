"use client";

import { useTranslations } from "next-intl";
import { Badge, Checkbox } from "@devdigest/ui";
import { useCiSecretStatus } from "@/lib/hooks/ci";
import { ALL_TRIGGERS, type CiTriggerEvent } from "./constants";
import { s } from "./styles";

export type PostAsMode = "github_review" | "pr_comment" | "none";

/**
 * AC-4/AC-4a/AC-4b/AC-64 — trigger events, publishing mode (review
 * recommended), the merge-blocking guidance as VISIBLE text (never only a
 * tooltip), and per-secret configured state. Every change here flows back
 * into the shared wizard state, which is what makes the Preview step
 * regenerate (AC-4c) — this component owns no preview logic itself.
 */
export function ConfigureStep({
  agentId,
  repo,
  triggers,
  onTriggers,
  postAs,
  onPostAs,
}: {
  agentId: string;
  repo: string;
  triggers: CiTriggerEvent[];
  onTriggers: (t: CiTriggerEvent[]) => void;
  postAs: PostAsMode;
  onPostAs: (p: PostAsMode) => void;
}) {
  const t = useTranslations("ci");
  const { data: secrets } = useCiSecretStatus(agentId, repo);

  const toggleTrigger = (trig: CiTriggerEvent) => {
    onTriggers(triggers.includes(trig) ? triggers.filter((x) => x !== trig) : [...triggers, trig]);
  };

  return (
    <>
      <div style={s.fieldGroup}>
        <label style={s.label}>{t("exportWizard.triggerLabel")}</label>
        {ALL_TRIGGERS.map((trig) => (
          <div key={trig} style={s.checkboxRow}>
            <Checkbox checked={triggers.includes(trig)} onChange={() => toggleTrigger(trig)} label={t(`exportWizard.triggers.${trig}`)} />
          </div>
        ))}
      </div>

      <div style={s.fieldGroup}>
        <label style={s.label}>{t("exportWizard.postResultsLabel")}</label>
        {(["github_review", "pr_comment", "none"] as const).map((mode) => (
          <label key={mode} style={s.radioRow}>
            <input
              type="radio"
              name="post-as"
              checked={postAs === mode}
              onChange={() => onPostAs(mode)}
            />
            {t(`exportWizard.postAs.${camel(mode)}`)}
            {mode === "github_review" && <Badge>{t("exportWizard.recommended")}</Badge>}
          </label>
        ))}
      </div>

      <div style={s.guidanceBox}>
        {t("exportWizard.blockMergeTitle")}: {t("exportWizard.blockMergeDesc")}
      </div>

      <div style={s.fieldGroup}>
        <label style={s.label}>{t("exportWizard.secretsHeading")}</label>
        {(secrets ?? []).map((secret) => (
          <div key={secret.name} style={s.secretRow}>
            <span className="mono">{secret.name}</span>
            {secret.provided_by_ci ? (
              <Badge icon="Check">{t("exportWizard.secretProvidedByCi")}</Badge>
            ) : secret.state === "configured" ? (
              <Badge icon="Check" color="var(--ok)">
                {t("exportWizard.secretConfigured")}
              </Badge>
            ) : secret.state === "unknown" ? (
              // P-7 — a 403 on the secrets-read endpoint (the common case for
              // a local-mode credential without `Secrets: read`) renders as
              // UNKNOWN, never as "missing" — telling the user to add a
              // secret they may already have would be actively wrong.
              <Badge icon="Info" color="var(--text-muted)">
                {t("exportWizard.secretUnknown")}
              </Badge>
            ) : (
              <Badge icon="AlertTriangle" color="var(--warning, var(--text-secondary))">
                {t("exportWizard.secretMissing")}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function camel(mode: string): string {
  return mode.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}
