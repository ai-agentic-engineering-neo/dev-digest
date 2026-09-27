/* ConfigTab — the skill editor: name, description (the skill's interface),
   type, body, and the enabled toggle. Saving a changed body creates a new
   immutable version, which is why the "what changed" note sits next to it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { MarkdownEditor } from "../../../MarkdownEditor";
import { isThirdParty } from "../../../../helpers";
import { SKILL_TYPES } from "../../../../constants";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [note, setNote] = React.useState("");
  const [enabled, setEnabled] = React.useState(skill.enabled);

  const bodyChanged = body !== skill.body;
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const save = () =>
    update.mutate(
      {
        id: skill.id,
        patch: {
          name,
          description,
          type,
          body,
          enabled,
          ...(bodyChanged && note ? { note } : {}),
        },
      },
      {
        onSuccess: (data) => {
          setNote("");
          toast.success(t("config.savedToast", { version: data.version }));
        },
      },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>

      {isThirdParty(skill.source) && (
        <div role="note" style={s.untrusted}>
          {t("config.untrustedNotice")}
        </div>
      )}

      <FormField label={t("config.name")} hint={t("config.nameHint")} required>
        <TextInput value={name} onChange={setName} placeholder={t("config.namePlaceholder")} />
      </FormField>

      <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
        <TextInput
          value={description}
          onChange={setDescription}
          placeholder={t("config.descriptionPlaceholder")}
        />
      </FormField>

      <FormField label={t("config.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>

      <FormField label={t("config.body")} hint={t("config.bodyHint")} required>
        <MarkdownEditor
          filename={`${skill.name}.md`}
          value={body}
          onChange={setBody}
          dirty={bodyChanged}
        />
      </FormField>

      {bodyChanged && (
        <FormField label={t("config.note")} hint={t("config.noteHint")}>
          <TextInput value={note} onChange={setNote} placeholder={t("config.notePlaceholder")} />
        </FormField>
      )}

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {update.isSuccess && (
          <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
