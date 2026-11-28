/* ImportSkillModal — "Add Skill → Import file". Two steps:
   1. pick a .md / .zip → the server parses it (SKILL.md only) and returns a
      preview; NOTHING is saved;
   2. review the editable core (name / type / description) and the full body,
      see which archive files were skipped (never read or run), and explicitly
      confirm trust before saving. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, FormField, Icon, Markdown, Modal, SelectInput, TextInput } from "@devdigest/ui";
import type { SkillImportPreview, SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "@/components/skill-badges";
import { useConfirmImport, useImportPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { s } from "./styles";

const ACCEPT = ".md,.zip,text/markdown,application/zip";

export function ImportSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const previewM = useImportPreview();
  const confirmM = useConfirmImport();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [trusted, setTrusted] = React.useState(false);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    previewM.mutate(file, {
      onSuccess: (p) => {
        setPreview(p);
        setName(p.name);
        setDescription(p.description);
        setType(p.type);
        setTrusted(false);
      },
    });
  };

  const back = () => {
    setPreview(null);
    setTrusted(false);
    confirmM.reset();
    previewM.reset();
    if (fileRef.current) fileRef.current.value = "";
  };

  const save = () => {
    if (!preview || !trusted) return;
    confirmM.mutate(
      { name: name.trim(), description: description.trim(), type, body: preview.body, trusted: true },
      {
        onSuccess: (skill) => {
          toast.success(t("import.savedToast", { name: skill.name }));
          onClose();
          router.push(`/skills/${skill.id}?tab=preview`);
        },
      },
    );
  };

  const error = (preview ? confirmM.error : previewM.error) as unknown;
  const errorMsg = error instanceof ApiError ? error.message : error ? String(error) : null;
  const canSave = !!preview && trusted && name.trim() !== "" && description.trim() !== "" && !confirmM.isPending;

  return (
    <Modal
      width={720}
      title={preview ? t("import.reviewTitle") : t("import.title")}
      subtitle={preview ? undefined : t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {preview && (
            <Button kind="ghost" icon="ChevronLeft" onClick={back}>
              {t("import.back")}
            </Button>
          )}
          <div style={s.footerRight}>
            <Button kind="ghost" onClick={onClose}>
              {t("import.cancel")}
            </Button>
            {preview && (
              <Button kind="primary" icon="Check" onClick={save} disabled={!canSave}>
                {confirmM.isPending ? t("import.saving") : t("import.save")}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        hidden
        data-testid="skill-import-file"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {!preview ? (
        <div style={s.drop}>
          <Icon.Upload size={22} />
          <div>{t("import.drop")}</div>
          <Button kind="secondary" icon="Folder" onClick={() => fileRef.current?.click()} loading={previewM.isPending}>
            {previewM.isPending ? t("import.parsing") : t("import.choose")}
          </Button>
          <div style={s.limits}>{t("import.limits")}</div>
        </div>
      ) : (
        <div style={s.body}>
          <div role="note" style={s.trustBox}>
            <Icon.AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{t("import.trustWarning")}</span>
          </div>
          <div style={s.sourceFile} className="mono">
            {t("import.sourceFile", { file: preview.source_file })}
          </div>
          <FormField label={t("config.name")} hint={t("config.nameHint")} required>
            <TextInput value={name} onChange={setName} mono />
          </FormField>
          <FormField label={t("config.type")}>
            <SelectInput
              value={type}
              onChange={(v) => setType(v as SkillType)}
              options={SKILL_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }))}
            />
          </FormField>
          <FormField label={t("config.description")} hint={t("config.descriptionHint")} required>
            <TextInput value={description} onChange={setDescription} />
          </FormField>
          <FormField label={t("config.body")}>
            <div style={s.bodyPreview}>
              <Markdown>{preview.body}</Markdown>
            </div>
          </FormField>
          {preview.warnings.length > 0 && (
            <>
              <div style={s.listTitle}>{t("import.warnings")}</div>
              <ul style={s.list}>
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </>
          )}
          {preview.skipped_files.length > 0 && (
            <>
              <div style={s.listTitle}>{t("import.skipped")}</div>
              <ul style={s.list} className="mono">
                {preview.skipped_files.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          )}
          <div style={{ marginTop: 14 }}>
            <Checkbox checked={trusted} onChange={setTrusted} label={t("import.trust")} />
          </div>
        </div>
      )}
      {errorMsg && (
        <div role="alert" style={s.error}>
          {errorMsg}
        </div>
      )}
    </Modal>
  );
}
