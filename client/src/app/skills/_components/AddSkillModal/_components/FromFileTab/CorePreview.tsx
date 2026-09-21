/* Core-file preview: what an import will actually save (resolved name, description,
   body excerpt). Ignored archive entries are listed by FilePicker right above it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ExtractedSkill } from "./extract";
import { excerptBody } from "./helpers";
import { s } from "./styles";

export function CorePreview({ extracted, name }: { extracted: ExtractedSkill; name: string }) {
  const t = useTranslations("skillsImport");
  const { text, hiddenLines } = excerptBody(extracted.body);
  return (
    <section style={s.preview} aria-label={t("preview.title")}>
      <div style={s.previewTitle}>{t("preview.title")}</div>
      <div>
        <span style={s.previewLabel}>{t("preview.name")}</span>
        {name ? (
          <span className="mono">{name}</span>
        ) : (
          <span style={s.previewMissing}>{t("preview.noName")}</span>
        )}
      </div>
      <div>
        <span style={s.previewLabel}>{t("preview.description")}</span>
        {extracted.description || t("preview.noDescription")}
      </div>
      <div>
        <span style={s.previewLabel}>{t("preview.body")}</span>
        <pre className="mono" style={s.previewBody}>
          {text}
        </pre>
        {hiddenLines > 0 && <div style={s.previewMore}>{t("preview.truncated", { count: hiddenLines })}</div>}
      </div>
    </section>
  );
}
