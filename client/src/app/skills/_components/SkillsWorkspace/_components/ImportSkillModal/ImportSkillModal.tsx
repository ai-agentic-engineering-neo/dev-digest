/* ImportSkillModal — upload a .md / .zip → server extracts the skill core →
   the user reads and edits the preview → saving creates a DISABLED skill.
   Nothing is persisted before "Save", and nothing in an archive is executed:
   the server only reads the Markdown core and lists every other file. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Icon, Modal } from "@devdigest/ui";
import type { Skill, SkillImportPreview } from "@devdigest/shared";
import { useCreateSkill, useImportSkillPreview } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { ApiError } from "../../../../../../lib/api";
import { IMPORT_ACCEPT, MAX_IMPORT_BYTES } from "../../constants";
import { fileToBase64 } from "../../helpers";
import { SkillForm, isDraftValid, type SkillDraft } from "../SkillForm";
import { s } from "./styles";

export function ImportSkillModal({ onClose, onImported }: { onClose: () => void; onImported: (s: Skill) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const parse = useImportSkillPreview();
  const create = useCreateSkill();
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [draft, setDraft] = React.useState<SkillDraft | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const error = localError ?? errorMessage(parse.error ?? create.error);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setLocalError(null);
    create.reset();
    if (file.size > MAX_IMPORT_BYTES) {
      setLocalError(t("import.tooLarge"));
      return;
    }
    const content_base64 = await fileToBase64(file);
    parse.mutate(
      { filename: file.name, content_base64 },
      {
        onSuccess: (p) => {
          setPreview(p);
          setDraft({ name: p.name, description: p.description, type: p.type, body: p.body });
        },
      },
    );
  };

  const confirm = () => {
    if (!draft) return;
    create.mutate(
      {
        name: draft.name.trim(),
        description: draft.description.trim(),
        type: draft.type,
        body: draft.body,
        source: "imported",
      },
      {
        onSuccess: (saved) => {
          toast.success(t("import.saved", { name: saved.name }));
          onImported(saved);
        },
      },
    );
  };

  const reset = () => {
    setPreview(null);
    setDraft(null);
    parse.reset();
    create.reset();
  };

  return (
    <Modal
      width={800}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {error && (
            <span role="alert" style={s.error}>
              {error}
            </span>
          )}
          {preview && (
            <Button kind="ghost" onClick={reset}>
              {t("import.back")}
            </Button>
          )}
          <Button kind="ghost" onClick={onClose}>
            {t("editor.cancel")}
          </Button>
          {preview && draft && (
            <Button
              kind="primary"
              onClick={confirm}
              loading={create.isPending}
              disabled={!isDraftValid(draft) || create.isPending}
            >
              {t("import.confirm")}
            </Button>
          )}
        </div>
      }
    >
      <div style={s.body}>
        {!preview || !draft ? (
          <FormField label={t("import.fileLabel")} hint={t("import.fileHint")}>
            <label style={s.drop}>
              <Icon.Upload size={18} />
              <span>{parse.isPending ? t("import.parsing") : t("import.choose")}</span>
              <input
                type="file"
                accept={IMPORT_ACCEPT}
                aria-label={t("import.fileLabel")}
                style={s.fileInput}
                disabled={parse.isPending}
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
          </FormField>
        ) : (
          <>
            <div role="note" style={s.trust}>
              <Icon.AlertTriangle size={16} style={s.trustIcon} />
              <div>
                <div style={s.trustTitle}>{t("import.trustTitle")}</div>
                <div>{t("import.trustBody")}</div>
              </div>
            </div>
            <div className="mono" style={s.core}>
              {t("import.corePath", { path: preview.core_path })}
            </div>
            {preview.warnings.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionTitle}>{t("import.warnings")}</div>
                <ul style={s.list}>
                  {preview.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.ignored_files.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionTitle}>
                  {t("import.ignoredTitle", { count: preview.ignored_files.length })}
                </div>
                <ul style={s.list}>
                  {preview.ignored_files.map((f) => (
                    <li key={f.path} style={s.ignored}>
                      <span className="mono">{f.path}</span>
                      <Badge color={f.reason === "executable" ? "var(--crit)" : "var(--text-muted)"}>
                        {t(`import.reason.${f.reason}`)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <SkillForm value={draft} onChange={setDraft} />
          </>
        )}
      </div>
    </Modal>
  );
}

function errorMessage(err: unknown): string | null {
  if (!err) return null;
  return err instanceof ApiError ? err.message : String(err);
}
