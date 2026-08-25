"use client";

import { useTranslations } from "next-intl";
import { TextInput, Icon } from "@devdigest/ui";
import type { CiTarget } from "@devdigest/shared/contracts/eval-ci";
import { useCiTargets } from "@/lib/hooks/ci";
import { s } from "./styles";

/**
 * D13/AC-2/AC-2a — one option per REGISTERED target, read from the server;
 * nothing about CircleCI/Jenkins/CLI renders here (or anywhere in this step)
 * because they have no generator yet. The repo field is captured here (D4).
 */
export function TargetStep({
  target,
  onTarget,
  repo,
  onRepo,
}: {
  target: CiTarget;
  onTarget: (t: CiTarget) => void;
  repo: string;
  onRepo: (v: string) => void;
}) {
  const t = useTranslations("ci");
  const { data: targets, isLoading } = useCiTargets();

  return (
    <>
      <div style={s.fieldGroup}>
        <label style={s.label}>{t("exportWizard.repoLabel")}</label>
        <TextInput value={repo} onChange={onRepo} placeholder={t("exportWizard.repoPlaceholder")} />
        <span style={s.hint}>{t("exportWizard.repoHint")}</span>
      </div>

      <div style={s.fieldGroup}>
        <label style={s.label}>{t("exportWizard.steps.target")}</label>
        {isLoading ? null : (
          <div style={s.targetGrid} role="radiogroup" aria-label={t("exportWizard.steps.target")}>
            {(targets ?? []).map((opt) => (
              <button
                key={opt.target}
                role="radio"
                aria-checked={target === opt.target}
                style={s.targetCard(target === opt.target)}
                onClick={() => onTarget(opt.target)}
              >
                <Icon.GitBranch size={16} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t(opt.label_key)}</div>
                  <div style={s.hint}>{t(`${opt.label_key}Desc`)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
