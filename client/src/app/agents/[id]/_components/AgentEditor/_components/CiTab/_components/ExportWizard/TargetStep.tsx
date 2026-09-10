"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SelectInput, TextInput, Icon } from "@devdigest/ui";
import type { CiTarget } from "@devdigest/shared/contracts/eval-ci";
import { useCiTargets } from "@/lib/hooks/ci";
import { useRepos } from "@/lib/hooks/core";
import { s } from "./styles";

/**
 * D13/AC-2/AC-2a — one option per REGISTERED target, read from the server;
 * nothing about CircleCI/Jenkins/CLI renders here (or anywhere in this step)
 * because they have no generator yet. The repo field is captured here (D4).
 *
 * The repo is picked from the workspace's imported repositories rather than
 * typed free-hand — a repo DevDigest hasn't imported is one it has no
 * credentials to open a PR against, so a typo used to surface only as a 422
 * three steps later. Free text stays available as a fallback while the repo
 * list is empty or still loading, so the wizard is never a dead end.
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
  const { data: repos, isLoading: reposLoading } = useRepos();

  const repoOptions = (repos ?? []).map((r) => r.full_name);

  // Preselect the only sensible default so Continue isn't a guess.
  React.useEffect(() => {
    if (!repo && repoOptions.length > 0) onRepo(repoOptions[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoOptions.length]);

  return (
    <>
      <div style={s.fieldGroup}>
        <label style={s.label}>{t("exportWizard.repoLabel")}</label>
        {reposLoading ? null : repoOptions.length > 0 ? (
          <>
            <SelectInput
              value={repo}
              onChange={onRepo}
              options={repoOptions}
              aria-label={t("exportWizard.repoLabel")}
            />
            <span style={s.hint}>{t("exportWizard.repoSelectHint")}</span>
          </>
        ) : (
          <>
            <TextInput value={repo} onChange={onRepo} placeholder={t("exportWizard.repoPlaceholder")} />
            <span style={s.hint}>{t("exportWizard.repoHint")}</span>
          </>
        )}
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
