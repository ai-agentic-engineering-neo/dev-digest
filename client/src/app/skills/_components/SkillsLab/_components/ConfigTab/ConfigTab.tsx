/* ConfigTab — the skill's configuration (Config design): a header with the
   Enabled toggle (saves at once, no new version), Discard (while dirty) and
   Save; then Name, Description (directive hint), Type, the line-numbered body
   editor, an optional "What changed?" note and Delete. Without `skill` it is
   the create form ("New skill"). Dirty state is reported up so the page can
   guard navigation. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "@/components/skill-type-badge";
import {
  useCreateSkill,
  useUpdateSkill,
  type SkillInput,
} from "@/lib/hooks/skills";
import { DeleteSkillDialog } from "../DeleteSkillDialog";
import { useToast } from "@/lib/toast";
import { MAX_NOTE_CHARS } from "../../constants";
import { canSubmitSkill, isValidSkillName } from "@/lib/skill-name";
import { skillPatch } from "../../helpers";
import { BodyEditor } from "../BodyEditor";
import { emptyForm, formFromSkill } from "./helpers";
import { s } from "./styles";
import { errorMessage } from "@/lib/error-message";

export function ConfigTab({
  skill,
  onCreated,
  onDeleted,
  onDirtyChange,
}: {
  skill?: Skill;
  onCreated: (skill: Skill) => void;
  onDeleted: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  // Separate mutation for the Enabled toggle: it saves at once, and sharing
  // `update` would flip the Save button to "Saving…" on every toggle.
  const toggle = useUpdateSkill();
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [form, setForm] = React.useState<SkillInput>(() => (skill ? formFromSkill(skill) : emptyForm()));
  const [note, setNote] = React.useState("");
  const [enabled, setEnabled] = React.useState(true); // create mode only
  const [error, setError] = React.useState<string | null>(null);
  const set = <K extends keyof SkillInput>(k: K, v: SkillInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const patch = skill ? skillPatch(skill, form) : null;
  const dirty = skill
    ? Object.keys(patch ?? {}).length > 0
    : Boolean(form.name || form.description.trim() || form.body.trim());

  React.useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  // A tab switch / unmount must not leave the page thinking there are unsaved edits.
  React.useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const pending = create.isPending || update.isPending;
  const nameInvalid = form.name.length > 0 && !isValidSkillName(form.name);
  const trimmedNote = note.trim();

  const save = async () => {
    setError(null);
    try {
      if (skill) {
        if (!patch || Object.keys(patch).length === 0) return;
        const saved = await update.mutateAsync({
          id: skill.id,
          patch: { ...patch, ...(trimmedNote ? { note: trimmedNote } : {}) },
        });
        setNote("");
        toast.success(t("config.saved", { version: saved.version }));
      } else {
        const created = await create.mutateAsync({
          ...form,
          description: form.description.trim(),
          ...(trimmedNote ? { note: trimmedNote } : {}),
          ...(enabled ? {} : { enabled: false }),
        });
        toast.success(t("config.created", { name: created.name }));
        onDirtyChange(false);
        onCreated(created);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const discard = () => {
    setForm(skill ? formFromSkill(skill) : emptyForm());
    setNote("");
    setEnabled(true); // create-mode toggle back to its default
    setError(null);
  };

  return (
    <div style={s.wrap}>
      {skill && confirmingDelete && (
        <DeleteSkillDialog
          skill={skill}
          onClose={() => setConfirmingDelete(false)}
          onDeleted={() => {
            onDirtyChange(false);
            onDeleted();
          }}
        />
      )}
      <div style={s.head}>
        <h2 style={s.title}>{skill ? t("config.title") : t("config.createTitle")}</h2>
        {skill && (
          <span className="mono" style={s.chip}>
            {t("detail.version", { version: skill.version })}
          </span>
        )}
        <span style={s.spacer} />
        <span style={s.enabledLabel} title={t("config.enabledTitle")}>
          {t("config.enabled")}
        </span>
        <Toggle
          label={t("config.enabled")}
          on={skill ? skill.enabled : enabled}
          onChange={(v) =>
            skill
              ? toggle.mutate(
                  { id: skill.id, patch: { enabled: v } },
                  { onError: (e) => toast.error(`${t("config.toggleError")}: ${errorMessage(e)}`) },
                )
              : setEnabled(v)
          }
        />
        {dirty && (
          <Button kind="ghost" onClick={discard} disabled={pending}>
            {t("config.discard")}
          </Button>
        )}
        <Button
          kind="primary"
          icon="Check"
          onClick={save}
          disabled={pending || !dirty || !canSubmitSkill(form)}
        >
          {pending ? t("config.saving") : skill ? t("config.save") : t("config.create")}
        </Button>
      </div>
      {error && (
        <div role="alert" style={s.error}>
          {error}
        </div>
      )}
      {!skill && <p style={s.subtitle}>{t("config.subtitle")}</p>}

      <FormField label={t("config.name")} hint={t("config.nameHint")} required>
        <TextInput
          value={form.name}
          onChange={(v) => set("name", v.trim())}
          placeholder={t("config.namePlaceholder")}
          mono
          aria-label={t("config.name")}
          aria-invalid={nameInvalid}
        />
      </FormField>
      <FormField label={t("config.description")} hint={t("config.descriptionHint")} required>
        <TextInput
          value={form.description}
          onChange={(v) => set("description", v)}
          placeholder={t("config.descriptionPlaceholder")}
          aria-label={t("config.description")}
        />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput
          value={form.type}
          onChange={(v) => set("type", v as SkillType)}
          options={SKILL_TYPES.map((ty) => ({ value: ty, label: t(`config.typeOptions.${ty}`) }))}
          mono={false}
        />
      </FormField>
      <FormField label={t("config.bodyLabel")} hint={t("config.versionHint")} required>
        <BodyEditor
          fileName={form.name || "skill"}
          value={form.body}
          onChange={(v) => set("body", v)}
          dirty={skill ? form.body !== skill.body : form.body.length > 0}
          placeholder={t("config.bodyPlaceholder")}
          label={t("config.body")}
        />
      </FormField>
      <FormField label={t("config.note")} hint={t("config.noteHint")}>
        <TextInput
          value={note}
          onChange={(v) => setNote(v.slice(0, MAX_NOTE_CHARS))}
          placeholder={t("config.notePlaceholder")}
          aria-label={t("config.note")}
        />
      </FormField>

      {skill && (
        <div style={s.footer}>
          <Button kind="ghost" icon="Trash" onClick={() => setConfirmingDelete(true)}>
            {t("config.delete")}
          </Button>
        </div>
      )}
    </div>
  );
}
