/* SkillEditorModal — create or edit a skill: name, description (the skill's
   interface — hinted to be directive), type, and the markdown body with a
   Write / Preview switch. Editing saves only changed fields (a content change
   → new version on the server). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Markdown, Modal, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "../../../../../../components/skill-type-badge";
import { useCreateSkill, useUpdateSkill, type SkillInput } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { BODY_ROWS, MODAL_WIDTH } from "./constants";
import { canSubmitSkill, isValidSkillName, skillPatch } from "./helpers";
import { s } from "./styles";

export function SkillEditorModal({ skill, onClose }: { skill?: Skill; onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const [form, setForm] = React.useState<SkillInput>({
    name: skill?.name ?? "",
    description: skill?.description ?? "",
    type: skill?.type ?? "custom",
    body: skill?.body ?? "",
  });
  const [bodyMode, setBodyMode] = React.useState<"write" | "preview">("write");
  const [error, setError] = React.useState<string | null>(null);
  const set = <K extends keyof SkillInput>(k: K, v: SkillInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const pending = create.isPending || update.isPending;
  const nameInvalid = form.name.length > 0 && !isValidSkillName(form.name);

  const submit = async () => {
    setError(null);
    try {
      if (skill) {
        const patch = skillPatch(skill, form);
        if (Object.keys(patch).length > 0) {
          const saved = await update.mutateAsync({ id: skill.id, patch });
          toast.success(t("editor.saved", { version: saved.version }));
        }
      } else {
        const created = await create.mutateAsync({ ...form, description: form.description.trim() });
        toast.success(t("editor.created", { name: created.name }));
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={skill ? t("editor.editTitle") : t("editor.createTitle")}
      subtitle={t("editor.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("editor.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={submit} disabled={pending || !canSubmitSkill(form)}>
            {pending ? t("editor.saving") : skill ? t("editor.save") : t("editor.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("editor.name")} hint={t("editor.nameHint")} required>
          <TextInput
            value={form.name}
            onChange={(v) => set("name", v.trim())}
            placeholder={t("editor.namePlaceholder")}
            mono
            aria-label={t("editor.name")}
            aria-invalid={nameInvalid}
          />
        </FormField>
        <FormField label={t("editor.description")} hint={t("editor.descriptionHint")} required>
          <TextInput
            value={form.description}
            onChange={(v) => set("description", v)}
            placeholder={t("editor.descriptionPlaceholder")}
            aria-label={t("editor.description")}
          />
        </FormField>
        <FormField label={t("editor.type")}>
          <SelectInput
            value={form.type}
            onChange={(v) => set("type", v as SkillType)}
            options={SKILL_TYPES.map((ty) => ({ value: ty, label: t(`type.${ty}`) }))}
          />
        </FormField>
        <FormField
          label={t("editor.body")}
          hint={t("editor.bodyHint")}
          required
          right={
            <div style={s.bodyTabs}>
              <button type="button" style={s.bodyTab(bodyMode === "write")} onClick={() => setBodyMode("write")}>
                {t("editor.write")}
              </button>
              <button
                type="button"
                style={s.bodyTab(bodyMode === "preview")}
                onClick={() => setBodyMode("preview")}
              >
                {t("editor.previewTab")}
              </button>
            </div>
          }
        >
          {bodyMode === "write" ? (
            <Textarea
              value={form.body}
              onChange={(v) => set("body", v)}
              placeholder={t("editor.bodyPlaceholder")}
              rows={BODY_ROWS}
              mono
            />
          ) : (
            <div style={s.preview}>
              <Markdown>{form.body}</Markdown>
            </div>
          )}
        </FormField>
        {error && (
          <div role="alert" style={s.error}>
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
