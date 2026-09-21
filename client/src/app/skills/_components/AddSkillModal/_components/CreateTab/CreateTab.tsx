/* Create tab — type a skill in by hand. Name + body are required; every attribute is saved. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Textarea, TextInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { BODY_ROWS, DEFAULT_SKILL_TYPE } from "../../constants";
import type { AddSkillTabProps } from "../../types";
import { SkillTypeField } from "../SkillTypeField";
import { buildCreatePayload, canCreate } from "./helpers";

export function CreateTab({ onAdded }: AddSkillTabProps) {
  const t = useTranslations("skillsImport");
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_SKILL_TYPE);
  const [body, setBody] = React.useState("");

  const form = { name, description, type, body };
  const ready = canCreate(form) && !create.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    try {
      onAdded(await create.mutateAsync(buildCreatePayload(form)), "created");
    } catch {
      // Surfaced by the global mutation error toast; keep the modal open to retry.
    }
  };

  return (
    <form onSubmit={submit} aria-label={t("tabs.create")}>
      <FormField label={t("fields.name")}>
        <TextInput value={name} onChange={setName} placeholder={t("fields.namePlaceholder")} mono aria-label={t("fields.name")} />
      </FormField>
      <FormField label={t("fields.description")}>
        <TextInput
          value={description}
          onChange={setDescription}
          placeholder={t("fields.descriptionPlaceholder")}
          aria-label={t("fields.description")}
        />
      </FormField>
      <SkillTypeField value={type} onChange={setType} />
      <FormField label={t("fields.body")}>
        <Textarea value={body} onChange={setBody} placeholder={t("fields.bodyPlaceholder")} rows={BODY_ROWS} mono />
      </FormField>
      <Button type="submit" kind="primary" full disabled={!ready} loading={create.isPending}>
        {create.isPending ? t("create.submitting") : t("create.submit")}
      </Button>
    </form>
  );
}
