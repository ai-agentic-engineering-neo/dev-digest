/* ImportSkillModal — upload a .md/.zip, parse it server-side (preview only),
   review it, then save. Nothing is persisted before the explicit Save click. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal, FormField, TextInput, SelectInput, Markdown } from "@devdigest/ui";
import type { SkillImportPreview, SkillType } from "@devdigest/shared";
import { useCreateSkill, useImportPreview } from "@/lib/hooks/skills";
import { SKILL_TYPES } from "@/lib/skill-type";
import { saveErrorMessage } from "@/components/skill-editor-modal/helpers";
import { ACCEPT, MODAL_WIDTH } from "./constants";
import { fileToBase64, isSupportedSkillFile } from "./helpers";
import { s } from "./styles";

export function ImportSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const preview = useImportPreview();
  const create = useCreateSkill();
  const [data, setData] = React.useState<SkillImportPreview | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [error, setError] = React.useState<string | null>(null);

  const [dragging, setDragging] = React.useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    setData(null);
    if (!isSupportedSkillFile(file.name)) {
      setError(`${t("import.failed")}: ${t("import.unsupported")}`);
      return;
    }
    try {
      const content_base64 = await fileToBase64(file);
      const p = await preview.mutateAsync({ filename: file.name, content_base64 });
      setData(p);
      setName(p.name);
      setDescription(p.description);
      setType(p.type);
    } catch (err) {
      setError(`${t("import.failed")}: ${saveErrorMessage(err)}`);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // required so the browser allows a drop instead of opening the file
    setDragging(true);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) void handleFile(file);
  };

  const save = async () => {
    if (!data) return;
    setError(null);
    try {
      await create.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        type,
        body: data.body,
        source: "imported_file",
      });
      onClose();
    } catch (err) {
      setError(`${t("editor.errors.saveFailed")}: ${saveErrorMessage(err)}`);
    }
  };

  const canSave = !!data && !!name.trim() && !!description.trim() && !create.isPending;

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          {data && (
            <Button kind="primary" onClick={save} disabled={!canSave}>
              {create.isPending ? t("import.saving") : t("import.save")}
            </Button>
          )}
        </div>
      }
    >
      <div style={s.modalBody}>
        {error && (
          <div role="alert" style={s.error}>
            {error}
          </div>
        )}
        <FormField label={t("import.fileLabel")}>
          <div
            data-testid="skill-drop-zone"
            style={{ ...s.dropZone, ...(dragging ? s.dropZoneActive : null) }}
            onDragOver={onDragOver}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <Icon.Upload size={20} />
            <div>{t("import.dropHint")}</div>
            <input type="file" accept={ACCEPT} aria-label={t("import.chooseFile")} onChange={onPick} />
          </div>
          {preview.isPending && <div style={s.muted}>{t("import.reading")}</div>}
        </FormField>

        {data && (
          <>
            <div role="note" style={s.trust}>
              <Icon.AlertTriangle size={16} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={s.trustTitle}>{t("import.trustTitle")}</div>
                <div>{t("import.trustBody")}</div>
              </div>
            </div>

            <FormField label={t("editor.fields.name")} required>
              <TextInput value={name} onChange={setName} mono />
            </FormField>
            <FormField label={t("editor.fields.description")} required hint={t("editor.fields.descriptionHint")}>
              <TextInput value={description} onChange={setDescription} />
            </FormField>
            <FormField label={t("editor.fields.type")}>
              <SelectInput
                value={type}
                onChange={(v) => setType(v as SkillType)}
                options={SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }))}
              />
            </FormField>

            <div style={s.section}>
              <div style={s.sectionLabel}>{t("import.bodyPreview")}</div>
              <div style={s.body}>
                <Markdown>{data.body}</Markdown>
              </div>
            </div>

            {data.ignored_files.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionLabel}>{t("import.ignoredTitle")}</div>
                <div style={s.hint}>{t("import.ignoredHint")}</div>
                <ul style={s.list} className="mono">
                  {data.ignored_files.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}

            {data.warnings.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionLabel}>{t("import.warningsTitle")}</div>
                <ul style={s.list}>
                  {data.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
