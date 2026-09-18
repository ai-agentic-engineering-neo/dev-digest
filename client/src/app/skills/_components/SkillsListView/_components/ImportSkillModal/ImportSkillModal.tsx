"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, Markdown } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { useConfirmSkillImport, usePreviewSkillImport } from "../../../../../../lib/hooks/skills";
import { DEFAULT_TYPE, MODAL_WIDTH } from "./constants";
import { dataUrlToBase64 } from "./helpers";
import { s } from "./styles";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Import-skill modal — preview then confirm. Cancel persists nothing. */
export function ImportSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const previewMut = usePreviewSkillImport();
  const confirmMut = useConfirmSkillImport();
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");

  const canConfirm =
    !!preview &&
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    preview.body.trim().length > 0 &&
    !confirmMut.isPending;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const content_base64 = dataUrlToBase64(await readFileAsDataUrl(file));
    const next = await previewMut.mutateAsync({ filename: file.name, content_base64 });
    setPreview(next);
    setName(next.name);
    setDescription(next.description);
  };

  const confirm = async () => {
    if (!canConfirm || !preview) return;
    await confirmMut.mutateAsync({
      name: name.trim(),
      description: description.trim(),
      type: DEFAULT_TYPE,
      body: preview.body,
    });
    onClose();
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("importModal.title")}
      subtitle={t("importModal.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("importModal.cancel")}
          </Button>
          <Button kind="primary" icon="Upload" onClick={confirm} disabled={!canConfirm}>
            {confirmMut.isPending ? t("importModal.confirming") : t("importModal.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.warning}>{t("importModal.warning")}</div>
        <FormField label={t("importModal.pickFile")} required>
          <input
            type="file"
            accept=".md,.zip,.skill,text/markdown,application/zip"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </FormField>
        {preview && (
          <>
            <FormField label={t("create.fields.name")} required>
              <TextInput value={name} onChange={setName} />
            </FormField>
            <FormField
              label={t("create.fields.description")}
              required
              hint={t("create.fields.descriptionHint")}
            >
              <TextInput value={description} onChange={setDescription} />
            </FormField>
            <div style={s.markdown}>
              <Markdown>{preview.body}</Markdown>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
