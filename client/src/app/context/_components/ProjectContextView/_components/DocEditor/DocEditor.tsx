/* DocEditor — the Edit pill of /context: a labelled monospace textarea over the
   document's effective text and a Save button. Pure view: the draft, the save
   call and the Ctrl/Cmd+S shortcut belong to ProjectContextView. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Textarea } from "@devdigest/ui";
import { PROJECT_CONTEXT_FILE_MAX_CHARS, canSaveDraft, isOverFileCap } from "@/lib/project-context";
import { s } from "./styles";

export interface DocEditorProps {
  /** The text being edited. */
  value: string;
  /** The text on record (override or repository): Save is enabled only when `value` differs. */
  effective: string;
  saving: boolean;
  onChange: (text: string) => void;
  onSave: () => void;
}

export function DocEditor({ value, effective, saving, onChange, onSave }: DocEditorProps) {
  const t = useTranslations("context");
  const over = isOverFileCap(value);
  return (
    <div style={s.root} data-testid="context-editor">
      <label style={s.label}>
        <span style={s.hidden}>{t("page.edit.label")}</span>
        <Textarea mono rows={18} value={value} onChange={onChange} />
      </label>
      <div style={s.footer}>
        {over && (
          <span role="status" style={s.counter(true)}>
            {t("page.edit.counter", { count: value.length.toLocaleString("en-US"), max: PROJECT_CONTEXT_FILE_MAX_CHARS.toLocaleString("en-US") })}
            {" — "}
            {t("page.edit.overCap", { max: PROJECT_CONTEXT_FILE_MAX_CHARS.toLocaleString("en-US") })}
          </span>
        )}
        <span style={s.save}>
          <Button kind="primary" size="sm" disabled={saving || !canSaveDraft(value, effective)} onClick={onSave}>
            {saving ? t("page.edit.saving") : t("page.edit.save")}
          </Button>
        </span>
      </div>
    </div>
  );
}
