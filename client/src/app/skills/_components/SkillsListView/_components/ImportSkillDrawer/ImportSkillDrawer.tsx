/* ImportSkillDrawer — single file-upload flow: pick a file → read it
   client-side as base64 → POST /skills/import for a preview (nothing
   persisted yet) → edit the prefilled name/type/body → Save creates the
   skill for real. No "from URL" or "community catalog" tab this iteration. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Drawer, FormField, TextInput, SelectInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { ApiError } from "../../../../../../lib/api";
import { useCreateSkill, useImportSkillFile } from "../../../../../../lib/hooks/skills";
import { ACCEPT, DEFAULT_TYPE, DRAWER_WIDTH, TYPE_OPTIONS } from "./constants";
import { fileToBase64 } from "./helpers";
import { s } from "./styles";

export function ImportSkillDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const importFile = useImportSkillFile();
  const create = useCreateSkill();

  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [body, setBody] = React.useState("");
  const [hasPreview, setHasPreview] = React.useState(false);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content_base64 = await fileToBase64(file);
    importFile.mutate(
      { filename: file.name, content_base64 },
      {
        onSuccess: (data) => {
          setName(data.name);
          setBody(data.body);
          setWarnings(data.warnings);
          setHasPreview(true);
        },
      },
    );
  };

  const save = async () => {
    const skill = await create.mutateAsync({ name, type, body });
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={t("drawer.title")}
      subtitle={t("drawer.subtitleFile")}
      onClose={onClose}
      footer={
        hasPreview ? (
          <div style={s.footer}>
            <Button kind="ghost" onClick={onClose}>
              {t("createModal.cancel")}
            </Button>
            <Button kind="primary" icon="Check" onClick={save} disabled={create.isPending}>
              {create.isPending ? t("createModal.creating") : t("preview.save")}
            </Button>
          </div>
        ) : undefined
      }
    >
      {!hasPreview && (
        <FormField label={t("drawer.chooseFileLabel")} hint={t("drawer.chooseFileHint")}>
          <input
            type="file"
            accept={ACCEPT}
            onChange={onFileChange}
            disabled={importFile.isPending}
            style={s.fileInput}
          />
        </FormField>
      )}
      {importFile.isPending && <div style={s.importingNote}>{t("file.importing")}</div>}
      {importFile.isError && (
        <div style={s.errorNote}>
          {t("drawer.importFailed")}
          {importFile.error instanceof ApiError ? `: ${importFile.error.message}` : null}
        </div>
      )}
      {hasPreview && (
        <>
          {warnings.length > 0 && (
            <div style={s.warnings}>
              <div style={s.warningsTitle}>{t("drawer.warningsTitle")}</div>
              {warnings.map((w, i) => (
                <div key={i} style={s.warningItem}>
                  {w}
                </div>
              ))}
            </div>
          )}
          <FormField label={t("file.nameLabel")}>
            <TextInput value={name} onChange={setName} placeholder={t("file.namePlaceholder")} />
          </FormField>
          <FormField label={t("createModal.fields.type")}>
            <SelectInput
              value={type}
              onChange={(v) => setType(v as SkillType)}
              options={TYPE_OPTIONS.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }))}
            />
          </FormField>
          <FormField label={t("file.bodyLabel")} hint={t("file.bodyHint")}>
            <Textarea value={body} onChange={setBody} rows={10} mono />
          </FormField>
        </>
      )}
    </Drawer>
  );
}
