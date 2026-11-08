/* DocEditor — Markdown source textarea + Save for a `.devdigest` doc. Controlled: the draft lives
   in DocPane. Kit Textarea has no aria props, so this is a native, CSS-var styled <textarea>. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export interface DocEditorProps {
  path: string;
  value: string;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
}

export function DocEditor({ path, value, dirty, saving, error, onChange, onSave }: DocEditorProps) {
  const t = useTranslations("context");
  return (
    <div style={s.wrap}>
      <textarea
        style={s.textarea}
        aria-label={t("pane.editorLabel", { path })}
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
      <div style={s.bar}>
        <Button kind="primary" size="sm" disabled={!dirty || saving} onClick={onSave}>
          {saving ? t("pane.saving") : t("pane.save")}
        </Button>
        {dirty && <span style={s.unsaved}>{t("pane.unsaved")}</span>}
      </div>
      {error && (
        <p role="alert" style={s.error}>
          {error}
        </p>
      )}
    </div>
  );
}
