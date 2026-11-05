/* ImportSkillModal — two-step import: choose a .md / .zip → the server parses
   it into a PREVIEW (nothing saved) → the user reviews the trust notice,
   warnings, used/ignored files and the body, edits name/description/type, and
   only then confirms. Confirm re-sends the same upload; the server re-parses it
   so what is stored is exactly what was previewed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Icon, Markdown, Modal, SelectInput, TextInput } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import type { SkillImportPreview } from "@/lib/types";
import { SKILL_TYPES } from "../../../../../../components/skill-type-badge";
import {
  fileToUpload,
  useImportSkill,
  usePreviewSkillImport,
  type SkillUpload,
} from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { canSubmitSkill } from "../../helpers";
import { ACCEPT, MODAL_WIDTH } from "./constants";
import { formatBytes } from "./helpers";
import { s } from "./styles";

interface Draft {
  name: string;
  description: string;
  type: SkillType;
}

export function ImportSkillModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const previewMut = usePreviewSkillImport();
  const importMut = useImportSkill();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [upload, setUpload] = React.useState<SkillUpload | null>(null);
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reading, setReading] = React.useState("");

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setReading(file.name);
    try {
      const up = await fileToUpload(file);
      const p = await previewMut.mutateAsync(up);
      setUpload(up);
      setPreview(p);
      setDraft({ name: p.name, description: p.description, type: p.type });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const reset = () => {
    setUpload(null);
    setPreview(null);
    setDraft(null);
    setError(null);
  };

  const confirm = async () => {
    if (!upload || !draft) return;
    setError(null);
    try {
      const saved = await importMut.mutateAsync({ ...upload, ...draft, description: draft.description.trim() });
      toast.success(t("import.saved", { name: saved.name }));
      onImported(saved);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const canConfirm =
    !!preview && !!draft && canSubmitSkill({ ...draft, body: preview.body }) && !importMut.isPending;

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {preview && (
            <Button kind="ghost" icon="ChevronLeft" onClick={reset}>
              {t("import.back")}
            </Button>
          )}
          <div style={s.spacer} />
          <Button kind="ghost" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          {preview && (
            <Button kind="primary" icon="Check" onClick={confirm} disabled={!canConfirm}>
              {importMut.isPending ? t("import.saving") : t("import.confirm")}
            </Button>
          )}
        </div>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        style={s.hiddenInput}
        data-testid="skill-import-input"
        onChange={(e) => void choose(e.target.files?.[0])}
      />

      {!preview && (
        <div style={s.dropZone}>
          <Icon.Upload size={22} style={s.dropIcon} />
          <Button kind="secondary" icon="FileText" onClick={() => inputRef.current?.click()} disabled={previewMut.isPending}>
            {previewMut.isPending ? t("import.parsing", { file: reading }) : t("import.choose")}
          </Button>
          <span style={s.muted}>{t("import.accepts")}</span>
        </div>
      )}

      {preview && draft && (
        <div>
          <div style={s.notice} role="note">
            <Icon.AlertTriangle size={16} style={s.noticeIcon} />
            <div>
              <div style={s.noticeTitle}>{t("import.trustTitle")}</div>
              <div>{t("import.trustBody")}</div>
            </div>
          </div>

          {preview.warnings.length > 0 && (
            <div style={s.section}>
              <div style={s.label}>{t("import.warnings")}</div>
              <ul style={s.warnings}>
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <FormField label={t("config.name")} hint={t("config.nameHint")} required>
            <TextInput
              value={draft.name}
              onChange={(v) => setDraft({ ...draft, name: v.trim() })}
              mono
              aria-label={t("config.name")}
            />
          </FormField>
          <FormField label={t("config.description")} hint={t("config.descriptionHint")} required>
            <TextInput
              value={draft.description}
              onChange={(v) => setDraft({ ...draft, description: v })}
              placeholder={t("config.descriptionPlaceholder")}
              aria-label={t("config.description")}
            />
          </FormField>
          <FormField label={t("config.type")}>
            <SelectInput
              value={draft.type}
              onChange={(v) => setDraft({ ...draft, type: v as SkillType })}
              options={SKILL_TYPES.map((ty) => ({ value: ty, label: t(`type.${ty}`) }))}
            />
          </FormField>

          <div style={s.section}>
            <div style={s.label}>{t("import.files")}</div>
            <div style={s.files}>
              {preview.files.map((f) => (
                <div key={f.path} style={s.fileRow}>
                  <span className="mono" style={s.filePath(f.status === "ignored")}>
                    {f.path}
                  </span>
                  <span style={s.muted}>{formatBytes(f.size)}</span>
                  {f.status === "used" ? (
                    <Badge color="var(--ok)" bg="var(--ok-bg)">
                      {t("import.used")}
                    </Badge>
                  ) : (
                    <span title={f.reason ?? undefined}>
                      <Badge color="var(--warn)" bg="var(--warn-bg)">
                        {t("import.ignored")}
                      </Badge>
                    </span>
                  )}
                  {f.reason && <span style={s.reason}>{f.reason}</span>}
                </div>
              ))}
            </div>
          </div>

          <div style={s.section}>
            <div style={s.label}>{t("import.bodyPreview")}</div>
            <div style={s.body}>
              <Markdown>{preview.body}</Markdown>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" style={s.error}>
          {error}
        </div>
      )}
    </Modal>
  );
}
