"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Card, FormField, TextInput, SearchableSelect, Icon } from "@devdigest/ui";
import type { CiTarget } from "@devdigest/shared";
import { useRepos } from "@/lib/hooks/repos";
import { RECOMMENDED_TARGET, TARGET_OPTIONS } from "../../constants";

/** Step 1 — pick a CI target (GHA preselected + "recommended") and the target repo. */
export function TargetStep({
  target,
  onSelectTarget,
  repo,
  onRepoChange,
}: {
  target: CiTarget;
  onSelectTarget: (target: CiTarget) => void;
  repo: string;
  onRepoChange: (value: string) => void;
}) {
  const t = useTranslations("ci");
  const repos = useRepos();

  // Prefer a searchable dropdown over the tracked repositories so the user picks
  // an existing repo instead of typing owner/name by hand. Fall back to free
  // text while the list is loading or when the workspace has no tracked repos
  // (so the wizard is never blocked).
  const repoOptions = React.useMemo(
    () => (repos.data ?? []).map((r) => r.full_name),
    [repos.data],
  );
  const hasRepoOptions = repoOptions.length > 0;

  return (
    <div style={{ padding: 24 }}>
      <div
        role="radiogroup"
        aria-label={t("exportWizard.targetsLabel")}
        style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 24 }}
      >
        {TARGET_OPTIONS.map((option) => {
          const selected = option.id === target;
          const I = Icon[option.icon];
          return (
            <Card
              key={option.id}
              hover
              style={{
                cursor: "pointer",
                border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
                background: selected ? "var(--bg-hover)" : "var(--bg-elevated)",
              }}
            >
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSelectTarget(option.id)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  width: "100%",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <I size={16} />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {t(`exportWizard.targets.${option.id}`)}
                    </span>
                  </div>
                  {option.id === RECOMMENDED_TARGET && (
                    <Badge color="var(--ok)" bg="var(--bg-hover)">
                      {t("exportWizard.recommended")}
                    </Badge>
                  )}
                </div>
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                  {t(`exportWizard.targets.${option.id}Desc`)}
                </span>
              </button>
            </Card>
          );
        })}
      </div>

      <FormField label={t("exportWizard.repoLabel")} hint={t("exportWizard.repoHint")} required>
        {hasRepoOptions ? (
          <SearchableSelect
            value={repo}
            onChange={onRepoChange}
            options={repoOptions}
            placeholder={t("exportWizard.repoSelectPlaceholder")}
          />
        ) : (
          <TextInput
            value={repo}
            onChange={onRepoChange}
            placeholder={t("exportWizard.repoPlaceholder")}
            mono
          />
        )}
      </FormField>
    </div>
  );
}
