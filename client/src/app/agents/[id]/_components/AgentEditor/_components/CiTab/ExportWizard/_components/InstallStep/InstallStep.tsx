"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Card, MonoLink, SectionLabel } from "@devdigest/ui";
import type { CiFile, CiTarget } from "@devdigest/shared";

/** Step 4 — "Open a PR" (GHA only) or "Copy files as a zip" (always). Non-GHA
 *  targets get file-download only — no "Open a PR" action (spec Edge case). */
export function InstallStep({
  target,
  repo,
  files,
  isOpeningPr,
  prUrl,
  prError,
  onOpenPr,
  onDownloadZip,
}: {
  target: CiTarget;
  repo: string;
  files: CiFile[];
  isOpeningPr: boolean;
  prUrl: string | null;
  prError: string | null;
  onOpenPr: () => void;
  onDownloadZip: () => void;
}) {
  const t = useTranslations("ci");
  const isGha = target === "gha";

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      {isGha ? (
        <Card>
          <SectionLabel>{t("exportWizard.installCardTitle")}</SectionLabel>
          <div style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
            {t("exportWizard.installCardBody", { repo: repo || t("exportWizard.ownerRepo"), count: files.length })}
          </div>
          {prUrl ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t("exportWizard.installStep.prOpened")}</div>
              <MonoLink href={prUrl}>{t("exportWizard.installStep.viewPr")}</MonoLink>
            </div>
          ) : (
            <Button kind="primary" icon="GitPullRequest" onClick={onOpenPr} disabled={isOpeningPr}>
              {isOpeningPr ? t("exportWizard.installing") : t("exportWizard.install")}
            </Button>
          )}
          {prError && (
            <div role="alert" style={{ fontSize: 12.5, color: "var(--crit)", marginTop: 10 }}>
              {prError}
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <div style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {t("exportWizard.installStep.cliOnlyNotice", { target: t(`exportWizard.targets.${target}`) })}
          </div>
        </Card>
      )}

      <Card>
        <SectionLabel>{t("exportWizard.installStep.zipTitle")}</SectionLabel>
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.45 }}>
          {t("exportWizard.installStep.zipHint")}
        </div>
        <Button kind="secondary" icon="Copy" onClick={onDownloadZip}>
          {t("exportWizard.installStep.zipButton")}
        </Button>
      </Card>
    </div>
  );
}
