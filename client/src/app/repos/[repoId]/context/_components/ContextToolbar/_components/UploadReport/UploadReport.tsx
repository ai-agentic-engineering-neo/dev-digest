"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { reasonText, type Translate } from "../../helpers";
import type { UploadReportState } from "../../hooks/useUploadQueue";
import { s } from "../../styles";

export interface UploadReportProps {
  report: UploadReportState;
  onResolve: (name: string, overwrite: boolean) => void;
  onDismiss: () => void;
}

export function UploadReport({ report, onResolve, onDismiss }: UploadReportProps) {
  const t = useTranslations("context");
  const tr: Translate = (key, values) => t(key, values);
  return (
    <section role="region" aria-label={t("upload.title")} style={s.report}>
      <div style={s.reportTitle}>{t("upload.title")}</div>
      <ul style={s.list}>
        {report.added.map((path) => (
          <li key={`added:${path}`}>{t("upload.added", { path })}</li>
        ))}
        {report.rejected.map((r) => (
          <li key={`rejected:${r.name}`}>
            {t("upload.rejected", {
              name: r.name,
              reason: r.reason
                ? reasonText(tr, { reason: r.reason, rule: r.rule })
                : t("errors.saveFailed", { message: r.message ?? "" }),
            })}
          </li>
        ))}
        {report.conflicts.map((name) => (
          <li key={`conflict:${name}`} style={s.conflictRow}>
            <span>{t("upload.conflict", { name })}</span>
            <Button size="sm" onClick={() => onResolve(name, true)} aria-label={`${t("upload.overwrite")} ${name}`}>
              {t("upload.overwrite")}
            </Button>
            <Button size="sm" onClick={() => onResolve(name, false)} aria-label={`${t("upload.cancel")} ${name}`}>
              {t("upload.cancel")}
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Button size="sm" onClick={onDismiss}>
          {t("upload.dismiss")}
        </Button>
      </div>
    </section>
  );
}

export default UploadReport;
