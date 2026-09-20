"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField } from "@devdigest/ui";
import type { Skill, SkillImportPreview } from "@devdigest/shared";
import { getErrorMessage, useCreateSkill, useImportPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { IMPORT_ACCEPT, IMPORT_MAX_KB } from "../../constants";
import { validateSkillForm, type FieldErrors, type SkillFormValues } from "@/lib/skill-form";
import { checkImportFile, fileToBase64 } from "../../helpers";
import { ImportPreview } from "./_components/ImportPreview";
import { s } from "./styles";

/** "From file" tab: pick .md/.zip -> server preview (stores nothing) -> explicit confirm. */
export function ImportTab({ onDone }: { onDone: (created: Skill) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const previewMut = useImportPreview();
  const create = useCreateSkill();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [values, setValues] = React.useState<SkillFormValues | null>(null);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [fileError, setFileError] = React.useState<string | null>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileError(null);
    const bad = checkImportFile(file);
    if (bad) {
      setFileError(t(`import.${bad}`, { max: IMPORT_MAX_KB }));
      return;
    }
    let content_base64: string;
    try {
      content_base64 = await fileToBase64(file);
    } catch {
      setFileError(t("import.readFailed"));
      return;
    }
    previewMut.mutate(
      { filename: file.name, content_base64 },
      {
        onSuccess: (p) => {
          setPreview(p);
          setValues({ name: p.name, description: p.description, type: p.type, body: p.body });
          setErrors({});
        },
        onError: (err) => setFileError(getErrorMessage(err, t("drawer.importFailed"))),
      },
    );
  };

  const confirm = () => {
    if (!preview || !values) return;
    const next = { ...values, body: preview.body };
    const found = validateSkillForm(next);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    create.mutate(
      { ...next, source: "imported_file" },
      {
        onSuccess: (sk) => {
          toast.success(t("import.saved", { name: sk.name }));
          onDone(sk);
        },
        onError: (err) => toast.error(getErrorMessage(err, t("editor.saveFailed"))),
      },
    );
  };

  if (preview && values) {
    return (
      <div>
        <ImportPreview
          preview={preview}
          values={values}
          errors={errors}
          onChange={(patch) => setValues({ ...values, ...patch })}
        />
        <div style={s.actions}>
          <Button kind="secondary" onClick={() => { setPreview(null); setValues(null); }}>
            {t("import.cancel")}
          </Button>
          <Button kind="primary" onClick={confirm} loading={create.isPending}>
            {create.isPending ? t("import.confirming") : t("import.confirm")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <FormField label={t("import.pickLabel")} hint={t("import.pickHint", { max: IMPORT_MAX_KB })}>
      <div style={s.pick}>
        <input
          ref={inputRef}
          type="file"
          accept={IMPORT_ACCEPT}
          aria-label={t("import.pickLabel")}
          style={s.input}
          onChange={onPick}
        />
        <Button kind="secondary" icon="Upload" loading={previewMut.isPending} onClick={() => inputRef.current?.click()}>
          {previewMut.isPending ? t("import.previewing") : t("import.choose")}
        </Button>
        {fileError && <div role="alert" style={s.error}>{fileError}</div>}
      </div>
    </FormField>
  );
}
