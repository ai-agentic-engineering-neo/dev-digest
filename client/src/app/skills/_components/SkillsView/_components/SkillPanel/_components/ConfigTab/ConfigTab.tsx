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
  // Lives above the keyed form so the confirmation survives the post-save remount.
  const [savedVersion, setSavedVersion] = React.useState<number | null>(null);
  // A new version (body save or restore) remounts the form with fresh values.
  return (
    <ConfigForm key={skill.version} skill={skill} savedVersion={savedVersion} onSaved={setSavedVersion} />
  );
}

function ConfigForm({
  skill,
  savedVersion,
  onSaved,
}: {
  skill: Skill;
  savedVersion: number | null;
  onSaved: (version: number) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(skill));
  // Only an unsaved switch change is state; otherwise follow the skill (card toggle).
  const [enabledEdit, setEnabledEdit] = React.useState<boolean | null>(null);
  if (enabledEdit === skill.enabled) setEnabledEdit(null);
  const enabled = enabledEdit ?? skill.enabled;
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [serverError, setServerError] = React.useState<string | null>(null);

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
          onSaved(data.version);
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
        onEnabledChange={setEnabledEdit}
        bodyHint
      />
      <div style={s.footer}>
        <Button kind="primary" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("detail.config.saving") : t("detail.config.save")}
        </Button>
        {savedVersion !== null && savedVersion >= skill.version && (
          <span style={s.saved}>{t("detail.config.saved", { version: savedVersion })}</span>
        )}
      </div>
    </div>
  );
}
