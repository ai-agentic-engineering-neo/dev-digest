/* ImportPreview — step 2 of the import: the exact text that would be stored,
   and everything the extractor left behind (executables included). Rendering
   this is what makes "nothing is saved until you confirm" checkable. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, FormField, Icon, TextInput } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { approxTokens } from "@/lib/tokens";
import { s } from "../../styles";

/** The confirmation step: the exact text, and everything left behind. */
export function ImportPreview({
  preview,
  name,
  description,
  onName,
  onDescription,
}: {
  preview: SkillImportPreview;
  name: string;
  description: string;
  onName: (v: string) => void;
  onDescription: (v: string) => void;
}) {
  const t = useTranslations("skills");
  return (
    <div style={s.section}>
      <h3 style={s.h3}>{t("importPreview.title")}</h3>
      <p style={s.muted}>{t("importPreview.subtitle")}</p>
      <div role="note" style={s.trust}>
        <Icon.AlertTriangle size={14} />
        <span>{t("importPreview.trust")}</span>
      </div>

      <FormField label={t("importPreview.name")} required>
        <TextInput value={name} onChange={onName} />
      </FormField>
      <FormField label={t("importPreview.description")}>
        <TextInput value={description} onChange={onDescription} />
      </FormField>

      <div style={s.previewHead}>
        <span style={s.previewLabel}>{t("importPreview.body")}</span>
        <Badge color="var(--text-muted)">
          {t("config.tokens", { count: approxTokens(preview.body) })}
        </Badge>
        <Badge color="var(--text-muted)">{t(`listItem.type.${preview.type}`)}</Badge>
      </div>
      <pre className="mono" style={s.pre}>
        {preview.body}
      </pre>

      {preview.files_used.length > 0 && (
        <>
          <div style={s.previewLabel}>{t("importPreview.filesUsed")}</div>
          <ul style={s.fileList}>
            {preview.files_used.map((f) => (
              <li key={f} className="mono">
                {f}
              </li>
            ))}
          </ul>
        </>
      )}

      {preview.files_skipped.length > 0 && (
        <>
          <div style={s.previewLabel}>{t("importPreview.filesSkipped")}</div>
          <ul style={s.fileList}>
            {preview.files_skipped.map((f) => (
              <li key={f.path}>
                <span className="mono">{f.path}</span>{" "}
                <span style={s.muted}>— {t(`importPreview.reason.${f.reason}`)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {preview.warnings.length > 0 && (
        <>
          <div style={s.previewLabel}>{t("importPreview.warnings")}</div>
          <ul style={s.fileList}>
            {preview.warnings.map((w) => (
              <li key={w} style={s.muted}>
                {w}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
