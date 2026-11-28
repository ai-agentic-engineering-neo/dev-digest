/* ImportSkillModal — import a skill from a .md or .zip in two steps. Step 1
   checks the file locally and asks the server for a preview (which stores
   nothing). Step 2 shows the trust warning, the editable fields and what was
   skipped; only "Save skill" creates the skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, FormField, Modal } from "@devdigest/ui";
import { useImportSkill, useImportSkillPreview } from "@/lib/hooks/skills";
import { SkillFields } from "../SkillFields";
import { TrustWarning } from "../TrustWarning";
import { SKILL_FORM_MODAL_WIDTH } from "../../constants";
import { canSaveDraft } from "../../helpers";
import { IMPORT_ACCEPT } from "./constants";
import { formatBytes, importFileError } from "./helpers";
import { readFileAsBase64 } from "./readFileAsBase64";
import { useImportFlow } from "./useImportFlow";
import { s } from "./styles";

export function ImportSkillModal({ onClose, onImported }: { onClose: () => void; onImported: (id: string) => void }) {
  const t = useTranslations("skills");
  const previewCall = useImportSkillPreview();
  const save = useImportSkill();
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [reading, setReading] = React.useState<string | null>(null);
  const flow = useImportFlow();
  const step = flow.state;
  const [enabled, setEnabled] = React.useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    previewCall.reset();
    const refusal = importFileError(file);
    if (refusal) {
      setLocalError(t(`import.${refusal}`, { name: file.name }));
      return;
    }
    setLocalError(null);
    setReading(file.name);
    try {
      const content_base64 = await readFileAsBase64(file);
      previewCall.mutate(
        { filename: file.name, content_base64 },
        {
          onSuccess: flow.showPreview,
          onSettled: () => setReading(null),
        },
      );
    } catch {
      setReading(null);
      setLocalError(t("import.readError", { name: file.name }));
    }
  };

  const back = () => {
    flow.back();
    save.reset();
  };

  const submit = () => {
    if (step.step !== "preview") return;
    save.mutate({ ...step.draft, enabled }, { onSuccess: (skill) => onImported(skill.id) });
  };

  const sizeLabel = (bytes: number) => {
    const { key, value } = formatBytes(bytes);
    return t(`import.size.${key}`, { value });
  };

  const error = localError ?? previewCall.error?.message ?? save.error?.message ?? null;

  return (
    <Modal
      width={SKILL_FORM_MODAL_WIDTH}
      title={t("import.title")}
      subtitle={step.step === "preview" ? t("import.subtitlePreview") : t("import.subtitlePick")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {step.step === "preview" && (
            <Button kind="ghost" icon="ChevronLeft" onClick={back}>
              {t("import.back")}
            </Button>
          )}
          <span style={s.spacer} />
          <Button kind="ghost" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          {step.step === "preview" && (
            <Button
              kind="primary"
              icon="Check"
              loading={save.isPending}
              disabled={!canSaveDraft(step.draft)}
              onClick={submit}
            >
              {save.isPending ? t("import.saving") : t("import.save")}
            </Button>
          )}
        </div>
      }
    >
      <div style={s.body}>
        {error && (
          <div role="alert" style={s.error}>
            {error}
          </div>
        )}
        {step.step === "pick" &&
          (reading ? (
            <div style={s.reading} aria-live="polite">
              {t("import.reading", { name: reading })}
            </div>
          ) : (
            <FormField label={t("import.fileLabel")} hint={t("import.fileHint")}>
              <ImportFileInput label={t("import.fileLabel")} onPick={(f) => void pick(f)} />
            </FormField>
          ))}
        {step.step === "preview" && (
          <>
            <TrustWarning />
            <div className="mono" style={s.source}>
              {t("import.importedFrom", { file: step.preview.source_file })}
            </div>
            <SkillFields value={step.draft} onChange={flow.edit} />
            {step.preview.skipped_files.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionTitle}>{t("import.skipped", { count: step.preview.skipped_files.length })}</div>
                <ul style={s.fileList}>
                  {step.preview.skipped_files.map((f) => (
                    <li key={f.path} style={s.fileRow}>
                      <span className="mono" style={s.filePath}>
                        {f.path}
                      </span>
                      <span style={s.fileSize}>{sizeLabel(f.size)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {step.preview.warnings.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionTitle}>{t("import.warnings")}</div>
                <ul style={s.fileList}>
                  {step.preview.warnings.map((w) => (
                    <li key={w} style={s.warning}>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Checkbox checked={enabled} onChange={setEnabled} label={t("import.enableAfter")} />
          </>
        )}
      </div>
    </Modal>
  );
}

function ImportFileInput({ label, onPick }: { label: string; onPick: (file: File | undefined) => void }) {
  return (
    <input
      type="file"
      aria-label={label}
      accept={IMPORT_ACCEPT}
      onChange={(e) => {
        onPick(e.target.files?.[0]);
        // Allow picking the same file again after an error.
        e.target.value = "";
      }}
      style={s.fileInput}
    />
  );
}
