"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, Icon } from "@devdigest/ui";
import { ACCEPTED_FILE_TYPES, ExtractError } from "./extract";
import { s } from "./styles";

export interface FilePickerProps {
  /** Name of the file (or archive entry) the form was pre-filled from. */
  loadedFile: string | null;
  /** Archive entries that were not processed. */
  ignored: string[];
  /** Last extraction failure, if any. */
  error: unknown;
  busy: boolean;
  onPick: (file: File) => void;
}

/** Dashed drop-zone-style button wrapping a hidden `<input type="file">`, plus status notices. */
export function FilePicker({ loadedFile, ignored, error, busy, onPick }: FilePickerProps) {
  const t = useTranslations("skillsImport");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires `change`.
    e.target.value = "";
    if (file) onPick(file);
  };

  const errorMessage =
    error == null
      ? null
      : error instanceof ExtractError
        ? t(`errors.${error.code}`, error.params)
        : t("errors.unknown");

  return (
    <FormField label={t("pick.label")} hint={t("pick.hint")}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        aria-label={t("pick.label")}
        style={s.hiddenInput}
        onChange={handleChange}
      />
      <button type="button" style={s.dropZone} disabled={busy} onClick={() => inputRef.current?.click()}>
        <Icon.Upload size={16} />
        {busy ? t("pick.reading") : loadedFile ? t("pick.replace") : t("pick.choose")}
      </button>
      {loadedFile && (
        <div style={s.notice}>
          <span style={s.loaded}>{t("pick.loaded", { file: loadedFile })}</span>
          {ignored.length > 0 && (
            <>
              <div>{t("pick.ignored", { count: ignored.length })}</div>
              <ul style={s.ignoredList}>
                {ignored.map((path) => (
                  <li key={path} className="mono">
                    {path}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {errorMessage && (
        <div role="alert" style={s.error}>
          {errorMessage}
        </div>
      )}
    </FormField>
  );
}
