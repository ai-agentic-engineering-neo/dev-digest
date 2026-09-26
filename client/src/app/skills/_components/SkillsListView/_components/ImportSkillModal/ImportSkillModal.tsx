/* ImportSkillModal — pick a Markdown file, preview what it would become, and
   only then create it.

   Markdown ONLY, by design: a skill is text. The file is read in the browser and
   sent as a JSON string, so there is no upload endpoint and nothing in the file
   is ever executed or unpacked. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, Icon } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { useCreateSkill, useImportSkillPreview } from "../../../../../../lib/hooks/skills";
import { SkillTypeSelect } from "@/components/skill-type-select";
import { isMarkdownFile } from "../../../../helpers";
import { MARKDOWN_ACCEPT } from "../../../../constants";
import { MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function ImportSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const preview = useImportSkillPreview();
  const create = useCreateSkill();

  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<SkillImportPreview | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset immediately so re-picking the SAME file after an error still fires
    // a change event.
    e.target.value = "";
    if (!file) return;

    setError(null);
    setDraft(null);

    if (!isMarkdownFile(file.name)) {
      setError(t("import.notMarkdown"));
      return;
    }
    try {
      const content = await file.text();
      setDraft(await preview.mutateAsync({ filename: file.name, content }));
    } catch {
      setError(t("import.failed"));
    }
  };

  const confirm = async () => {
    if (!draft) return;
    try {
      const skill = await create.mutateAsync({
        name: draft.name.trim(),
        description: draft.description.trim(),
        type: draft.type.trim(),
        body: draft.body,
      });
      onClose();
      router.push(`/skills/${skill.id}?tab=config`);
    } catch {
      // Keep the modal open so the user can retry — the global mutation-error
      // toast (client/src/lib/providers.tsx) already reported the failure.
    }
  };

  const canConfirm =
    !!draft && draft.name.trim().length > 0 && draft.type.trim().length > 0;

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
          <Button
            kind="primary"
            icon="Plus"
            onClick={confirm}
            disabled={!canConfirm || create.isPending}
          >
            {create.isPending ? t("import.creating") : t("import.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={MARKDOWN_ACCEPT}
            onChange={onFile}
            aria-label={t("import.choose")}
            style={s.fileInput}
          />
          <Button kind="secondary" icon="Upload" onClick={() => inputRef.current?.click()}>
            {preview.isPending ? t("import.parsing") : t("import.choose")}
          </Button>
          <span style={s.hint}>{t("import.chooseHint")}</span>
        </div>

        {error && (
          <div role="alert" style={s.error}>
            <Icon.AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        )}

        {draft && (
          <>
            <div style={s.previewHeader}>
              <Icon.FileText size={14} />
              <span style={s.previewTitle}>{t("import.previewTitle")}</span>
              <span style={s.hint}>{t("import.previewHint")}</span>
            </div>
            <FormField label={t("config.nameLabel")} required>
              <TextInput value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
            </FormField>
            <FormField label={t("config.descriptionLabel")}>
              <TextInput
                value={draft.description}
                onChange={(description) => setDraft({ ...draft, description })}
              />
            </FormField>
            <FormField label={t("config.typeLabel")} hint={t("config.typeHint")} required>
              <SkillTypeSelect value={draft.type} onChange={(type) => setDraft({ ...draft, type })} />
            </FormField>
            <FormField label={t("config.bodyLabel")}>
              {/* Read-only: the body is the file. Edit it in the editor after import. */}
              <pre className="mono" style={s.bodyPreview}>
                {draft.body}
              </pre>
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}
