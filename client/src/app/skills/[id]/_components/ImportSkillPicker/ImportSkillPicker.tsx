/* ImportSkillPicker — the file-picker half of the import flow. Reads the
   chosen .md/.zip file client-side, base64-encodes it, and posts it to the
   import-preview endpoint. Nothing is persisted here: the parsed preview is
   handed to `onImported` so the Skill Editor can render it for review, and
   the record is only written when the user clicks Save there. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "../../../../../lib/api";
import { useImportSkillPreview } from "../../../../../lib/hooks/skills";
import type { SkillImportPreview } from "../../../../../lib/hooks/skills";
import { fileToBase64 } from "./helpers";
import { s } from "./styles";

export function ImportSkillPicker({ onImported }: { onImported: (preview: SkillImportPreview) => void }) {
  const t = useTranslations("skills");
  const importPreview = useImportSkillPreview();

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content_base64 = await fileToBase64(file);
    importPreview.mutate(
      { filename: file.name, content_base64 },
      { onSuccess: (preview) => onImported(preview) },
    );
  };

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("import.title")}</h2>
      <p style={s.subtitle}>{t("import.subtitle")}</p>
      <input
        type="file"
        accept=".md,.zip"
        aria-label={t("import.pick")}
        disabled={importPreview.isPending}
        onChange={handleChange}
      />
      {importPreview.isPending && <p style={s.status}>{t("import.importing")}</p>}
      {importPreview.isError && (
        <p style={s.error} role="alert">
          {importPreview.error instanceof ApiError ? importPreview.error.message : t("import.importFailed")}
        </p>
      )}
    </div>
  );
}
