/* Config tab — name, description, type and the markdown body.

   Plain useState per field (no form library is installed); validation is
   server-side and surfaced by the global mutation-error toast. Only a changed
   body creates a new version — the server decides that, not this component.
   The `enabled` toggle is not local form state: it saves immediately, same as
   the rail's SkillCard toggle, so it never goes stale behind an unsaved edit.
   The rest of the form resets when the rail switches skills or a version
   changes (restore / body save) by remounting via `key` in SkillEditor. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { SkillTypeSelect } from "@/components/skill-type-select";
import { BODY_ROWS } from "./constants";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState(skill.type);
  const [body, setBody] = React.useState(skill.body);

  const canSave =
    name.trim().length > 0 && type.trim().length > 0 && body.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    update.mutate(
      {
        id: skill.id,
        patch: {
          name: name.trim(),
          description: description.trim(),
          type: type.trim(),
          body,
        },
      },
      { onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })) },
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
            onChange={(on) => update.mutate({ id: skill.id, patch: { enabled: on } })}
            size={16}
          />
        </label>
      </div>

      <FormField label={t("config.nameLabel")} required>
        <TextInput value={name} onChange={setName} placeholder={t("config.namePlaceholder")} />
      </FormField>

      <FormField label={t("config.descriptionLabel")}>
        <TextInput
          value={description}
          onChange={setDescription}
          placeholder={t("config.descriptionPlaceholder")}
        />
      </FormField>

      <FormField label={t("config.typeLabel")} hint={t("config.typeHint")} required>
        <SkillTypeSelect value={type} onChange={setType} />
      </FormField>

      <FormField
        label={t("config.bodyLabel")}
        hint={t("config.bodyHint")}
        required
        right={
          <span className="mono" style={s.versionNote}>
            {t("preview.version", { version: skill.version })}
          </span>
        }
      >
        <Textarea value={body} onChange={setBody} rows={BODY_ROWS} mono />
      </FormField>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={!canSave || update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
      </div>
    </div>
  );
}
