"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Toggle, Button } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill, useUpdateSkill, useSkillTokenCount } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES } from "@/lib/skill-display";
import { EMPTY_FORM, bodyFilename, formFromSkill, type SkillFormState } from "./helpers";
import { SkillBodyEditor } from "./SkillBodyEditor";
import { s } from "./styles";

/**
 * Config tab — also doubles as the /skills/new create form (`skill: null`).
 * The parent remounts this with `key={skill.id}` (edit) so switching skills
 * resets the form, same pattern as the agent editor's ConfigTab.
 */
export function ConfigTab({ skill, onCreated }: { skill: Skill | null; onCreated?: (skill: Skill) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const isCreate = skill == null;

  const [form, setForm] = React.useState<SkillFormState>(() => (skill ? formFromSkill(skill) : EMPTY_FORM));
  const [note, setNote] = React.useState("");
  const set = <K extends keyof SkillFormState>(key: K, value: SkillFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const { name, description, type, body, enabled } = form;

  const bodyDirty = body !== (skill?.body ?? "");
  const { tokens, isLoading: tokensLoading } = useSkillTokenCount(body, body.length > 0);

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const isPending = create.isPending || update.isPending;

  const save = () => {
    if (isCreate) {
      create.mutate(
        { name, description, type, body, source: "manual" },
        { onSuccess: (created) => onCreated?.(created) },
      );
    } else {
      update.mutate(
        { id: skill.id, patch: { name, description, type, body, enabled, note: note.trim() || undefined } },
        { onSuccess: (data) => toast.success(t("config.saved", { version: data.version })) },
      );
    }
  };

  const cancel = () => {
    if (skill) {
      setForm(formFromSkill(skill));
      setNote("");
    } else {
      setForm(EMPTY_FORM);
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{isCreate ? t("config.createTitle") : t("config.title")}</h2>
        {!isCreate && (
          <label style={s.enabledLabel}>
            {t("config.enabled")}
            <Toggle on={enabled} onChange={(v) => set("enabled", v)} size={16} />
          </label>
        )}
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={(v) => set("name", v)} />
      </FormField>
      <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
        <TextInput value={description} onChange={(v) => set("description", v)} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={type} onChange={(v) => set("type", v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("config.bodyLabel")} required>
        <SkillBodyEditor
          filename={bodyFilename(name)}
          value={body}
          onChange={(v) => set("body", v)}
          dirty={bodyDirty}
          tokens={tokens}
          tokensLoading={tokensLoading}
        />
      </FormField>
      {!isCreate && (
        <FormField label={t("config.noteLabel")}>
          <TextInput value={note} onChange={setNote} placeholder={t("config.notePlaceholder")} />
        </FormField>
      )}
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={isPending || !name.trim() || !body.trim()}>
          {isPending
            ? isCreate
              ? t("config.creating")
              : t("config.saving")
            : isCreate
              ? t("config.createSave")
              : t("config.save")}
        </Button>
        <Button kind="ghost" onClick={cancel} disabled={isPending}>
          {t("config.cancel")}
        </Button>
      </div>
    </div>
  );
}
