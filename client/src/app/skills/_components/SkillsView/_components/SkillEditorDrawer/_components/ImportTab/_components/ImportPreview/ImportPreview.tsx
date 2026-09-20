"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, Icon } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { SkillForm } from "../../../SkillForm";
import type { FieldErrors, SkillFormValues } from "@/lib/skill-form";
import { s } from "./styles";

interface Props {
  preview: SkillImportPreview;
  values: SkillFormValues;
  errors: FieldErrors;
  onChange: (patch: Partial<SkillFormValues>) => void;
}

/** What the server extracted from the upload. Nothing here is stored yet. */
export function ImportPreview({ preview, values, errors, onChange }: Props) {
  const t = useTranslations("skills");
  return (
    <div>
      <div role="note" style={s.trust}>
        <Icon.AlertTriangle size={18} style={s.trustIcon} />
        <div>
          <div style={s.trustTitle}>{t("import.trustTitle")}</div>
          {t("import.trustBody")}
        </div>
      </div>
      <div style={s.meta}>{t("import.sourceFile", { file: preview.source_file })}</div>

      {preview.truncated && (
        <div role="status" style={s.block}>
          {t("import.truncated")}
        </div>
      )}
      {preview.warnings.length > 0 && (
        <div style={s.block}>
          <div style={s.blockTitle}>{t("import.warningsTitle")}</div>
          <ul style={s.list}>
            {preview.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {preview.ignored_entries.length > 0 && (
        <div style={s.block}>
          <div style={s.blockTitle}>
            {t("import.ignoredTitle")} — {t("import.ignoredHint")}
          </div>
          <ul style={{ ...s.list, ...s.mono }}>
            {preview.ignored_entries.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <SkillForm values={values} errors={errors} onChange={onChange} showBody={false} />
      <FormField label={t("import.bodyLabel")}>
        <pre style={s.body}>{preview.body}</pre>
      </FormField>
    </div>
  );
}
