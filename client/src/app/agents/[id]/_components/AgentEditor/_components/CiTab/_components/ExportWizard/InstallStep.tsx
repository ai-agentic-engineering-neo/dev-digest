"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge } from "@devdigest/ui";
import type { CiExport, CiExportInputBody } from "@devdigest/shared/contracts/eval-ci";
import { exportCiArchive } from "@/lib/hooks/ci";
import { s } from "./styles";

const OPENROUTER_SECRET_NAME = "OPENROUTER_API_KEY";

/**
 * AC-5/AC-6/AC-10/AC-10a/AC-59 — the PR option (recommended) and the
 * archive option are CONCURRENT peers; the archive is never gated on
 * write-access and works even when the PR option is refused.
 */
export function InstallStep({
  agentId,
  input,
  onOpenPr,
  isExporting,
  result,
}: {
  agentId: string;
  input: CiExportInputBody;
  onOpenPr: () => void;
  isExporting: boolean;
  result: CiExport | null;
}) {
  const t = useTranslations("ci");
  const [archiveState, setArchiveState] = React.useState<"idle" | "loading" | "done" | "error">("idle");

  const downloadArchive = async () => {
    setArchiveState("loading");
    try {
      const blob = await exportCiArchive(agentId, input);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "devdigest-ci.zip";
      a.click();
      URL.revokeObjectURL(url);
      setArchiveState("done");
    } catch {
      setArchiveState("error");
    }
  };

  return (
    <>
      <div style={s.fieldGroup}>
        <label style={s.label}>{t("exportWizard.secretNote", { key: OPENROUTER_SECRET_NAME })}</label>
        <p style={s.hint}>{t("exportWizard.githubTokenAuto")}</p>
      </div>

      <div style={s.installRow}>
        <div style={s.installCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong>{t("exportWizard.installCardTitle")}</strong>
            <Badge>{t("exportWizard.recommended")}</Badge>
          </div>
          <p style={s.hint}>{t("exportWizard.installCardBody", { repo: input.repo ?? "", count: 5 })}</p>
          <Button kind="primary" onClick={onOpenPr} loading={isExporting}>
            {isExporting ? t("exportWizard.installing") : t("exportWizard.install")}
          </Button>
        </div>

        <div style={s.installCard}>
          <strong>{t("exportWizard.archiveCardTitle")}</strong>
          <p style={s.hint}>{t("exportWizard.archiveCardBody")}</p>
          <Button kind="secondary" onClick={downloadArchive} loading={archiveState === "loading"}>
            {t("exportWizard.downloadArchive")}
          </Button>
          {archiveState === "error" && <span style={s.hint}>{t("exportWizard.archiveError")}</span>}
        </div>
      </div>

      {result && (
        <div style={s.resultBox} role="status">
          {result.refused_reason ? (
            <span>{result.refused_reason}</span>
          ) : result.pr_url ? (
            <a href={result.pr_url} target="_blank" rel="noreferrer">
              {t("exportWizard.viewPr")}
            </a>
          ) : null}
        </div>
      )}
    </>
  );
}
