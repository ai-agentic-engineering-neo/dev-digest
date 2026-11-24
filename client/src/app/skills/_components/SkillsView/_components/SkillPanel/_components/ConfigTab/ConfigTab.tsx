/* ConfigTab — edit name, description, type, enabled and body. A changed body
   creates a new version server-side; other fields do not. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillForm } from "@/components/skill-form";
import {
  normalizeDraft,
  saveErrorMessage,
  validateDraft,
  type Draft,
  type FieldErrors,
} from "@/components/skill-editor-modal/helpers";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

const toDraft = (sk: Skill): Draft => ({
  name: sk.name,
  description: sk.description,
  type: sk.type,
  body: sk.body,
});

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(skill));
  const [enabled, setEnabled] = React.useState(skill.enabled);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [savedVersion, setSavedVersion] = React.useState<number | null>(null);

  // A restore (or another tab/editor) changes the skill under us: follow it.
  React.useEffect(() => {
    setDraft(toDraft(skill));
    setEnabled(skill.enabled);
    setSavedVersion(null);
  }, [skill.id, skill.version, skill.name, skill.description, skill.type, skill.body, skill.enabled]);

  const save = () => {
    const clean = normalizeDraft(draft);
    const found = validateDraft(clean);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;
    update.mutate(
      { id: skill.id, patch: { ...clean, enabled } },
      {
        onSuccess: (data) => {
          setSavedVersion(data.version);
          toast.success(t("detail.config.savedToast", { version: data.version }));
        },
        onError: (e) => setServerError(`${t("editor.errors.saveFailed")}: ${saveErrorMessage(e)}`),
      },
    );
  };

  return (
    <div style={s.form}>
      {serverError && (
        <div role="alert" style={s.error}>
          {serverError}
        </div>
      )}
      <SkillForm
        draft={draft}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        errors={errors}
        enabled={enabled}
        onEnabledChange={setEnabled}
        bodyHint
      />
      <div style={s.footer}>
        <Button kind="primary" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("detail.config.saving") : t("detail.config.save")}
        </Button>
        {savedVersion !== null && (
          <span style={s.saved}>{t("detail.config.saved", { version: savedVersion })}</span>
        )}
      </div>
    </div>
  );
}
