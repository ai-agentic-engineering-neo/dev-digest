/* ConfigTab — name, directive description, type and the markdown body. A
   changed body is saved as a new immutable version, with an optional change
   note shown on the Versions tab. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { SKILL_TYPES } from "../../../../../../../components/skill-type-badge";
import { BodyEditor } from "../BodyEditor";
import { draftFrom, isDirty, isValid, toPatch, type ConfigDraft } from "./helpers";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [draft, setDraft] = React.useState<ConfigDraft>(() => draftFrom(skill));
  const set = <K extends keyof ConfigDraft>(key: K, v: ConfigDraft[K]) => setDraft((d) => ({ ...d, [key]: v }));

  const bodyDirty = draft.body !== skill.body;
  const dirty = isDirty(draft, skill);

  const save = () =>
    update.mutate(
      { id: skill.id, patch: toPatch(draft, skill) },
      {
        onSuccess: (saved) => {
          setDraft(draftFrom(saved));
          toast.success(t("editor.saved", { name: saved.name, version: saved.version }));
        },
      },
    );

  const remove = () => {
    if (!window.confirm(t("preview.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, { onSuccess: () => router.push("/skills") });
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <span className="mono" style={s.versionChip}>
          <Icon.GitCommit size={12} />
          {t("preview.version", { version: skill.version })}
        </span>
        <label style={s.enabledLabel}>
          {t("preview.enabled")}
          <Toggle on={draft.enabled} onChange={(v) => set("enabled", v)} size={16} />
        </label>
      </div>

      {skill.source !== "manual" && skill.source !== "extracted" && (
        <div role="note" style={s.notice}>
          {t("preview.importedNotice")}
        </div>
      )}

      <FormField label={t("editor.name")} required>
        <TextInput mono value={draft.name} onChange={(v) => set("name", v)} aria-label={t("editor.name")} />
      </FormField>
      <FormField label={t("editor.description")} required hint={t("editor.descriptionHint")}>
        <TextInput
          value={draft.description}
          onChange={(v) => set("description", v)}
          placeholder={t("editor.descriptionPlaceholder")}
          aria-label={t("editor.description")}
        />
      </FormField>
      <FormField label={t("editor.type")}>
        <SelectInput
          mono
          value={draft.type}
          onChange={(v) => set("type", v as SkillType)}
          options={SKILL_TYPES.map((ty) => ({ value: ty, label: t(`listItem.type.${ty}`) }))}
        />
      </FormField>
      <FormField label={t("config.body")} required>
        <BodyEditor
          fileName={`${draft.name.trim() || skill.name}.md`}
          value={draft.body}
          onChange={(v) => set("body", v)}
          dirty={bodyDirty}
          label={t("config.body")}
        />
      </FormField>
      {bodyDirty && (
        <FormField label={t("config.changeNote")} hint={t("config.changeNoteHint", { version: skill.version + 1 })}>
          <TextInput
            value={draft.note}
            onChange={(v) => set("note", v)}
            placeholder={t("config.changeNotePlaceholder")}
            aria-label={t("config.changeNote")}
          />
        </FormField>
      )}

      <div style={s.actions}>
        <Button
          kind="primary"
          icon="Check"
          onClick={save}
          loading={update.isPending}
          disabled={!dirty || !isValid(draft) || update.isPending}
        >
          {t("editor.save")}
        </Button>
        <Button kind="secondary" onClick={() => setDraft(draftFrom(skill))} disabled={!dirty || update.isPending}>
          {t("editor.cancel")}
        </Button>
        <div style={s.spacer} />
        <Button kind="danger" size="sm" icon="Trash" onClick={remove} loading={del.isPending}>
          {t("preview.delete")}
        </Button>
      </div>
    </div>
  );
}
