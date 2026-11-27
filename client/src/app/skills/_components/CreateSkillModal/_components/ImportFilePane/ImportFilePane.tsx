/* ImportFilePane — "From file" tab of the Add skill dialog: pick or drop one
   Markdown / text file; it is read in the browser (no upload) and handed to the
   dialog as form values. Wrong type, empty or too long files are refused inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { SkillFormValues } from "@/app/skills/_components/helpers";
import { IMPORT_FILE_ACCEPT } from "../../constants";
import { readSkillFile, type FileImportError } from "../../helpers";
import { s } from "./styles";

export interface ImportFilePaneProps {
  onLoaded: (form: SkillFormValues, fileName: string) => void;
}

export function ImportFilePane({ onLoaded }: ImportFilePaneProps) {
  const t = useTranslations("skills");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<FileImportError | null>(null);
  const [dragOver, setDragOver] = React.useState(false);

  const load = async (file: File | undefined) => {
    if (!file) return;
    const result = await readSkillFile(file);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onLoaded(result.form, file.name);
  };

  return (
    <div
      style={s.drop(dragOver)}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void load(e.dataTransfer.files[0]);
      }}
      data-testid="skill-file-drop"
    >
      <Icon.Upload size={20} style={s.icon} />
      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_FILE_ACCEPT}
        aria-label={t("add.file.pick")}
        style={s.hiddenInput}
        onChange={(e) => {
          void load(e.target.files?.[0]);
          e.target.value = ""; // picking the same file again still fires onChange
        }}
      />
      <Button kind="secondary" icon="Upload" onClick={() => inputRef.current?.click()}>
        {t("add.file.pick")}
      </Button>
      <span style={s.hint}>{t("add.file.dropHint")}</span>
      {error && (
        <p role="alert" style={s.error}>
          {t(`add.file.${error}`)}
        </p>
      )}
    </div>
  );
}
