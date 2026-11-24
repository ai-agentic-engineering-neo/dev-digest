/* SkillEditorModal — create a skill, or edit an existing one (name, description,
   type, markdown body). Saving a changed body bumps the version server-side.
   Create mode can be pre-filled (`initial`) and tagged with a `source` — the
   Conventions page uses that to offer "skill from accepted conventions". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { Skill, SkillSource } from "@devdigest/shared";
import { SkillForm } from "@/components/skill-form";
import { useCreateSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { DEFAULT_TYPE, MODAL_WIDTH } from "./constants";
import { normalizeDraft, saveErrorMessage, validateDraft, type Draft, type FieldErrors } from "./helpers";
import { s } from "./styles";

export function SkillEditorModal({
  skill,
  initial,
  source = "manual",
  evidenceFiles,
  title,
  subtitle,
  submitLabel,
  banner,
  onClose,
  onSaved,
}: {
  /** Present → edit mode; absent → create mode. */
  skill?: Skill;
  /** Create mode only: pre-filled field values. */
  initial?: Partial<Draft>;
  /** Create mode only: provenance stored on the new skill. */
  source?: SkillSource;
  /** Create mode only: repo files the skill was derived from. */
  evidenceFiles?: string[];
  title?: string;
  subtitle?: string;
  /** Overrides the primary button label (default "Save"). */
  submitLabel?: string;
  /** Notice shown above the form (e.g. where a pre-filled draft came from). */
  banner?: React.ReactNode;
  onClose: () => void;
  onSaved?: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const [draft, setDraft] = React.useState<Draft>({
    name: skill?.name ?? initial?.name ?? "",
    description: skill?.description ?? initial?.description ?? "",
    type: skill?.type ?? initial?.type ?? DEFAULT_TYPE,
    body: skill?.body ?? initial?.body ?? "",
  });
  const [enabled, setEnabled] = React.useState(true);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const pending = create.isPending || update.isPending;

  const submit = async () => {
    const clean = normalizeDraft(draft);
    const found = validateDraft(clean);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;
    try {
      const saved = skill
        ? await update.mutateAsync({ id: skill.id, patch: clean })
        : await create.mutateAsync({
            ...clean,
            source,
            // The server default is enabled; only send the flag when it is turned off.
            ...(enabled ? {} : { enabled: false }),
            ...(evidenceFiles?.length ? { evidence_files: evidenceFiles } : {}),
          });
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setServerError(`${t("editor.errors.saveFailed")}: ${saveErrorMessage(e)}`);
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={title ?? (skill ? t("editor.titleEdit") : t("editor.titleCreate"))}
      subtitle={subtitle ?? t("editor.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("editor.cancel")}
          </Button>
          <Button kind="primary" onClick={submit} disabled={pending}>
            {pending ? t("editor.saving") : (submitLabel ?? t("editor.save"))}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {banner && <div style={s.banner}>{banner}</div>}
        {serverError && (
          <div role="alert" style={s.serverError}>
            {serverError}
          </div>
        )}
        <SkillForm
          draft={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          errors={errors}
          bodyHint={!!skill}
          {...(skill ? {} : { enabled, onEnabledChange: setEnabled })}
        />
      </div>
    </Modal>
  );
}
