/* SkillEditor — create/edit form for a single skill, mirroring the Agent
   Editor's Config tab idiom: local useState per field seeded from the loaded
   record, saved via `.mutate(..., { onSuccess: toast })`.

   Also doubles as the "import preview" confirmation screen: when `importPreview`
   is passed (and there's no persisted `skill` yet), the form is pre-filled from
   it, `source` is shown as a fixed, non-editable value, and nothing is written
   until the user explicitly clicks Save — the preview itself never persists
   anything server-side. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Textarea, Toggle, Button, Badge } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill, useUpdateSkill } from "../../../../../lib/hooks/skills";
import type { SkillImportPreview } from "../../../../../lib/hooks/skills";
import { useToast } from "../../../../../lib/toast";
import { TYPE_VALUES } from "./constants";
import { s } from "./styles";

export function SkillEditor({
  skill,
  importPreview,
}: {
  skill?: Skill;
  importPreview?: SkillImportPreview;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const create = useCreateSkill();
  const update = useUpdateSkill();

  // Imported-preview mode only applies while creating — an already-persisted
  // skill's provenance is fixed and never revisits this banner.
  const imported = !skill && !!importPreview;
  const seed = skill ?? importPreview;

  const [name, setName] = React.useState(seed?.name ?? "");
  const [type, setType] = React.useState<SkillType>(seed?.type ?? TYPE_VALUES[0]!);
  const [description, setDescription] = React.useState(seed?.description ?? "");
  const [body, setBody] = React.useState(seed?.body ?? "");
  const [enabled, setEnabled] = React.useState(skill?.enabled ?? true);

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`editor.typeOptions.${v}`) }));
  const pending = skill ? update.isPending : create.isPending;
  const canSave = name.trim().length > 0 && !pending;

  const save = () => {
    if (skill) {
      update.mutate(
        { id: skill.id, patch: { name, description, type, body, enabled } },
        { onSuccess: (data) => toast.success(t("editor.savedToast", { version: data.version })) },
      );
      return;
    }
    create.mutate(
      {
        name,
        description,
        type,
        body,
        enabled,
        ...(imported && importPreview ? { source: importPreview.source } : {}),
      },
      {
        onSuccess: (data) => {
          toast.success(t("editor.createdToast"));
          router.replace(`/skills/${data.id}`);
        },
      },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{skill ? skill.name : t("editor.newTitle")}</h2>
        <label style={s.enabledLabel}>
          {t("editor.enabledLabel")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>

      {imported && (
        <div style={s.importedBanner} role="status">
          {t("editor.importedNotice")}
        </div>
      )}

      <FormField label={t("editor.nameLabel")} required>
        <TextInput value={name} onChange={setName} />
      </FormField>

      <FormField label={t("editor.typeLabel")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>

      <FormField label={t("editor.interfaceLabel")} hint={t("editor.interfaceHint")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>

      {imported && importPreview && (
        <FormField label={t("editor.sourceLabel")}>
          <Badge color="var(--text-secondary)">{t(`listItem.source.${importPreview.source}`)}</Badge>
        </FormField>
      )}

      <FormField label={t("editor.bodyLabel")}>
        <Textarea value={body} onChange={setBody} rows={16} mono />
      </FormField>

      {imported && importPreview && importPreview.evidence_files.length > 0 && (
        <FormField label={t("editor.evidenceFilesLabel")} hint={t("editor.evidenceFilesHint")}>
          <ul style={s.evidenceList}>
            {importPreview.evidence_files.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </FormField>
      )}

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={!canSave}>
          {skill
            ? pending
              ? t("editor.saving")
              : t("editor.save")
            : pending
              ? t("editor.creating")
              : t("editor.create")}
        </Button>
        {skill && update.isSuccess && (
          <span style={s.savedNote}>{t("editor.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
