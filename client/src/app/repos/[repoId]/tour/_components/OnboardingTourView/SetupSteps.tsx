"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingSetupStepFact } from "@devdigest/shared";
import { s } from "./styles";

/**
 * AC-43: setup steps are presented as COPYABLE TEXT ONLY — every row is a
 * `<button>` that copies the command string to the clipboard; nothing here
 * executes, evaluates, or offers to execute it. Each step names the file that
 * evidenced it (AC-4).
 */
export function SetupSteps({ steps }: { steps: OnboardingSetupStepFact[] }) {
  const t = useTranslations("onboarding");
  const [copiedIdx, setCopiedIdx] = React.useState<number | null>(null);

  if (steps.length === 0) {
    return <p style={s.empty}>{t("skeleton.noSetupSteps")}</p>;
  }

  function copy(i: number, command: string) {
    void navigator.clipboard?.writeText(command);
    setCopiedIdx(i);
    setTimeout(() => setCopiedIdx((cur) => (cur === i ? null : cur)), 1200);
  }

  return (
    <div style={s.setupSteps}>
      {steps.map((step, i) => (
        <div key={`${step.command}-${i}`} style={s.setupRow}>
          <code className="mono" style={s.setupCommand}>
            {step.command}
          </code>
          <span style={s.setupEvidence}>{step.evidence_file}</span>
          <button
            type="button"
            title={t("copy.label")}
            aria-label={t("copy.label")}
            onClick={() => copy(i, step.command)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
              borderRadius: 5,
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--text-muted)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {copiedIdx === i ? <Icon.Check size={12} /> : <Icon.Copy size={12} />}
          </button>
        </div>
      ))}
    </div>
  );
}
