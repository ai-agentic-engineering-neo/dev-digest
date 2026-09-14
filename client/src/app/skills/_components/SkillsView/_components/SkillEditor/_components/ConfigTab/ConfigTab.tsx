/* Config tab — name / description / type / body, plus the workspace `enabled`
   gate top-right.

   The toggle deliberately holds NO local state: it reads `skill.enabled` from
   the `["skill", id]` query entry and mutates on change. The rail card reads
   the same gate out of the list entry, which `useUpdateSkill` patches in the
   same `onSuccess` — so flipping either one moves both. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, SelectInput, TextInput, Textarea, Toggle } from "@devdigest/ui";
import { SKILL_NAME_RE, type Skill, type SkillType } from "@devdigest/shared/contracts/knowledge";
import { useTokenCount, useUpdateSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES } from "../../../../constants";
import { MarkdownEditor } from "../MarkdownEditor";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [nameError, setNameError] = React.useState<string | null>(null);

  // Reset the draft when the rail selects a different skill.
  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setNameError(null);
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tokens = useTokenCount(body);
  const dirty = body !== skill.body;

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const save = () => {
    if (!SKILL_NAME_RE.test(name) || name.length > 64) {
      setNameError(t("config.nameInvalid"));
      return;
    }
    setNameError(null);
    update.mutate(
      { id: skill.id, patch: { name, description, type, body } },
      {
        onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })),
        onError: (e) => {
          // A workspace-unique name collision comes back as a clean 409/422 —
          // surface it on the field rather than as a system toast.
          if (e instanceof ApiError && (e.status === 409 || e.status === 422)) {
            setNameError(t("config.nameTaken", { name }));
          }
        },
      },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle
            on={skill.enabled}
            onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
            size={16}
          />
        </label>
      </div>

      <FormField label={t("config.name")} hint={t("config.nameHint")} required>
        <TextInput value={name} onChange={setName} mono placeholder={t("file.namePlaceholder")} />
        {nameError && (
          <div role="alert" style={s.error}>
            {nameError}
          </div>
        )}
      </FormField>

      <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
        <Textarea value={description} onChange={setDescription} rows={2} />
      </FormField>

      <FormField label={t("config.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>

      <FormField label={t("config.body")} hint={t("file.bodyHint")}>
        <MarkdownEditor value={body} onChange={setBody} slug={name} dirty={dirty} tokens={tokens} />
      </FormField>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {update.isSuccess && !dirty && (
          <span style={s.savedNote}>{t("config.saved", { version: skill.version })}</span>
        )}
      </div>
    </div>
  );
}
