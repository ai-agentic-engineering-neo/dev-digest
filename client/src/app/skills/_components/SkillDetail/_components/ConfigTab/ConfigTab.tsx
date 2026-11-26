/* ConfigTab — edit name · description · type · body (+ "What changed?" when the
   body is dirty). Mirrors the agent Config tab; the enabled switch is the global
   kill switch and saves immediately, like the card toggle. Danger zone → delete.
   After a merge of conventions, its conflicts open MergeConflictsDialog; Apply
   fills this form (the user still saves). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useClearMergeConflicts, useMergeConflicts } from "@/lib/hooks/conventions";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { hasErrors, validateSkillForm, type SkillFormValues } from "@/app/skills/_components/helpers";
import { FieldErrorText, SkillFormFields } from "@/app/skills/_components/SkillFormFields";
import { DeleteSkillDialog } from "./_components/DeleteSkillDialog";
import { MergeConflictsDialog } from "./_components/MergeConflictsDialog";
import { applyResolutions, type Resolution } from "./_components/MergeConflictsDialog/helpers";
import { buildSkillPatch, formFromSkill, isBodyChanged } from "./helpers";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const update = useUpdateSkill();
  // Separate instance so toggling doesn't show the Save button as "Saving…".
  const toggleEnabled = useUpdateSkill();
  // The parent keys this tab on id + version, so a new version remounts it with fresh values.
  const [form, setForm] = React.useState(() => formFromSkill(skill));
  const [takenName, setTakenName] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const conflicts = useMergeConflicts(skill.id).data ?? [];
  const clearConflicts = useClearMergeConflicts();
  // Rules whose existing text was not found when applying "Replace" (appended instead).
  const [appendedInstead, setAppendedInstead] = React.useState<string[]>([]);

  const bodyChanged = isBodyChanged(form, skill);
  const errors = validateSkillForm(bodyChanged ? form : { ...form, message: "" });
  if (!errors.name && takenName === form.name) errors.name = { key: "nameTaken" };
  const patch = buildSkillPatch(form, skill);
  const isPristine = Object.keys(patch).length === 0;

  const setField = <K extends keyof SkillFormValues>(field: K, value: SkillFormValues[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const applyConflicts = (choices: Record<string, Resolution>) => {
    const res = applyResolutions(form.body, conflicts, choices);
    if (res.changed > 0) {
      setForm((prev) => ({
        ...prev,
        body: res.body,
        message: prev.message || t("conflicts.versionMessage", { count: res.changed }),
      }));
    }
    setAppendedInstead(res.appendedInstead);
    clearConflicts(skill.id);
  };

  const save = () =>
    update.mutate(
      { id: skill.id, patch },
      {
        onSuccess: (saved) =>
          toast.success(
            saved.version > skill.version
              ? t("config.savedToast", { version: saved.version })
              : t("config.savedToastNoVersion"),
          ),
        // Other failures are toasted by the global MutationCache (lib/providers.tsx).
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) setTakenName(form.name);
        },
      },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle
            on={skill.enabled}
            onChange={(enabled) => toggleEnabled.mutate({ id: skill.id, patch: { enabled } })}
            size={16}
          />
        </label>
      </div>

      {appendedInstead.length > 0 && (
        <p style={s.note} role="status">
          {t("conflicts.appendedNote", { count: appendedInstead.length })}
        </p>
      )}

      <SkillFormFields values={form} errors={errors} onChange={setField} bodyHint={t("preview.bodyHint")} />

      {bodyChanged && (
        <FormField label={t("config.message")}>
          <TextInput
            value={form.message}
            onChange={(v) => setField("message", v)}
            placeholder={t("config.messagePlaceholder")}
            aria-label={t("config.message")}
            aria-invalid={!!errors.message}
          />
          <FieldErrorText id="skill-message-error" error={errors.message} />
        </FormField>
      )}

      <div style={s.actions}>
        <Button
          kind="primary"
          icon="Check"
          onClick={save}
          disabled={isPristine || hasErrors(errors) || update.isPending}
        >
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        <Button kind="ghost" onClick={() => setForm(formFromSkill(skill))} disabled={isPristine}>
          {t("config.cancel")}
        </Button>
        <span style={s.usedBy}>{t("config.usedBy", { count: skill.agent_count })}</span>
      </div>

      <section style={s.danger} aria-labelledby="skill-danger-title">
        <div style={s.dangerText}>
          <div id="skill-danger-title" style={s.dangerTitle}>
            {t("config.danger.title")}
          </div>
          <div style={s.dangerBody}>{t("config.danger.body")}</div>
        </div>
        <Button kind="danger" icon="Trash" onClick={() => setDeleting(true)}>
          {t("config.danger.delete")}
        </Button>
      </section>

      {conflicts.length > 0 && (
        <MergeConflictsDialog
          conflicts={conflicts}
          onApply={applyConflicts}
          onDismiss={() => clearConflicts(skill.id)}
        />
      )}

      {deleting && (
        <DeleteSkillDialog skill={skill} onClose={() => setDeleting(false)} onDeleted={() => router.push("/skills")} />
      )}
    </div>
  );
}
