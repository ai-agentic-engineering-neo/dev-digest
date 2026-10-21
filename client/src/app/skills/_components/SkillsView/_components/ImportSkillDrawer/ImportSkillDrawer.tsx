/* ImportSkillDrawer — upload a .md or .zip, preview the extracted core
   (name / description / type / body + ignored entries), confirm to save.
   Nothing is persisted before "Import skill"; imported skills start disabled. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Drawer, FormField, SectionLabel } from "@devdigest/ui";
import { useCreateSkill, usePreviewSkillImport } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { ApiError } from "../../../../../../lib/api";
import { SkillForm, type SkillFormValue } from "../../../SkillForm";
import { ACCEPT, fileToBase64 } from "./helpers";
import { s } from "./styles";

const DRAWER_WIDTH = 680;

export function ImportSkillDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const preview = usePreviewSkillImport();
  const create = useCreateSkill();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [readError, setReadError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<SkillFormValue | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setForm(null);
    setReadError(null);
    let content_base64: string;
    try {
      content_base64 = await fileToBase64(file);
    } catch (err) {
      setFileName(null);
      setReadError(err instanceof Error ? err.message : String(err));
      return;
    }
    preview.mutate(
      { filename: file.name, content_base64 },
      {
        onSuccess: (p) =>
          setForm({ name: p.name, description: p.description, type: p.type, body: p.body, enabled: false }),
      },
    );
  };

  const confirm = async () => {
    if (!form) return;
    const skill = await create.mutateAsync({ ...form, name: form.name.trim(), source: "imported_file" });
    toast.success(t("import.success", { name: skill.name }));
    onClose();
    router.push(`/skills/${skill.id}`);
  };

  const data = preview.data;
  const previewError =
    readError ?? (preview.error instanceof ApiError ? preview.error.message : preview.error?.message);

  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Upload"
            onClick={confirm}
            disabled={!form || create.isPending || !form.name.trim() || !form.body.trim()}
          >
            {create.isPending ? t("import.importing") : t("import.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("import.fileLabel")} hint={t("import.fileHint")}>
          <div style={s.fileRow}>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              aria-label={t("import.fileLabel")}
              style={{ display: "none" }}
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button kind="secondary" size="sm" icon="Upload" onClick={() => inputRef.current?.click()}>
              {preview.isPending ? t("import.parsing") : t("import.choose")}
            </Button>
            {fileName && <span style={s.fileName}>{fileName}</span>}
          </div>
        </FormField>

        {previewError && (
          <div style={s.error} role="alert">
            {t("import.failed")}: {previewError}
          </div>
        )}

        {data && form && (
          <>
            <div style={s.trust}>{t("import.trust")}</div>
            <div>
              <SectionLabel>{t("import.previewTitle")}</SectionLabel>
              <div style={s.sourceFile}>{t("import.sourceFile", { file: data.source_file })}</div>
            </div>
            {data.warnings.length > 0 && (
              <div>
                <SectionLabel>{t("import.warnings")}</SectionLabel>
                <ul style={s.list}>
                  {data.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.ignored_files.length > 0 && (
              <div>
                <SectionLabel>{t("import.ignored", { count: data.ignored_files.length })}</SectionLabel>
                <ul style={s.list} className="mono">
                  {data.ignored_files.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            <SkillForm value={form} onChange={setForm} />
          </>
        )}
      </div>
    </Drawer>
  );
}
