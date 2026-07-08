"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Card, SectionLabel, Toggle } from "@devdigest/ui";
import type { PostAs, TriggerState } from "../../types";

const TRIGGER_KEYS: (keyof TriggerState)[] = ["opened", "synchronize", "reopened"];
const POST_AS_OPTIONS: PostAs[] = ["github_review", "pr_comment", "none"];
/** `ci.json`'s `exportWizard.postAs` keys are camelCase; map the snake_case
 *  `PostAs` contract values to them. */
const POST_AS_I18N_KEY: Record<PostAs, string> = {
  github_review: "githubReview",
  pr_comment: "prComment",
  none: "none",
};

/** Step 3 — trigger toggles, "post results as" policy, and the two secret
 *  readiness rows. Reads studio-local secrets state only (AC-7, AC-8, AC-9) —
 *  never calls the GitHub Secrets API. */
export function ConfigureStep({
  triggers,
  onToggleTrigger,
  postAs,
  onChangePostAs,
  openrouterReady,
  secretsLoading,
}: {
  triggers: TriggerState;
  onToggleTrigger: (key: keyof TriggerState) => void;
  postAs: PostAs;
  onChangePostAs: (value: PostAs) => void;
  openrouterReady: boolean;
  secretsLoading: boolean;
}) {
  const t = useTranslations("ci");

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <SectionLabel>{t("exportWizard.triggerLabel")}</SectionLabel>
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {TRIGGER_KEYS.map((key) => (
              <label
                key={key}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
              >
                <span style={{ fontSize: 13.5 }}>{t(`exportWizard.triggers.${key}`)}</span>
                <Toggle on={triggers[key]} onChange={() => onToggleTrigger(key)} />
              </label>
            ))}
          </div>
        </Card>
      </div>

      <div>
        <SectionLabel>{t("exportWizard.postResultsLabel")}</SectionLabel>
        <div role="radiogroup" aria-label={t("exportWizard.postResultsLabel")} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {POST_AS_OPTIONS.map((option) => (
            <label key={option} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
              <input
                type="radio"
                name="post-as"
                value={option}
                checked={postAs === option}
                onChange={() => onChangePostAs(option)}
              />
              {t(`exportWizard.postAs.${POST_AS_I18N_KEY[option]}`)}
              {option === "github_review" && (
                <Badge color="var(--ok)" bg="var(--bg-hover)">
                  {t("exportWizard.recommended")}
                </Badge>
              )}
            </label>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>{t("exportWizard.secrets.heading")}</SectionLabel>
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span className="mono" style={{ fontSize: 13 }}>
                OPENROUTER_API_KEY
              </span>
              {secretsLoading ? (
                <Badge>{t("exportWizard.secrets.checking")}</Badge>
              ) : openrouterReady ? (
                <Badge color="var(--ok)" bg="var(--bg-hover)">
                  {t("exportWizard.secrets.set")}
                </Badge>
              ) : (
                <Badge color="var(--warn)" bg="var(--bg-hover)">
                  {t("exportWizard.secrets.notSet")}
                </Badge>
              )}
            </div>
            {!secretsLoading && !openrouterReady && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45 }}>
                {t("exportWizard.secrets.missingHint", { key: "OPENROUTER_API_KEY" })}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span className="mono" style={{ fontSize: 13 }}>
                GITHUB_TOKEN
              </span>
              <Badge color="var(--ok)" bg="var(--bg-hover)">
                {t("exportWizard.secrets.autoProvided")}
              </Badge>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
