/* SkillForm — the editable fields of a skill, shared by the editor and the
   import confirm step: name, directive description, type, markdown body. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Chip, FormField, Markdown, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "../../../../../../components/skill-type-badge";
import { s } from "./styles";

export interface SkillDraft {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export function isDraftValid(d: SkillDraft): boolean {
  return d.name.trim() !== "" && d.description.trim() !== "" && d.body.trim() !== "";
}

export function SkillForm({ value, onChange }: { value: SkillDraft; onChange: (d: SkillDraft) => void }) {
  const t = useTranslations("skills");
  const [mode, setMode] = React.useState<"write" | "preview">("write");
  const set = <K extends keyof SkillDraft>(key: K, v: SkillDraft[K]) => onChange({ ...value, [key]: v });

  return (
    <div>
      <div style={s.row}>
        <div style={s.grow}>
          <FormField label={t("editor.name")} required>
            <TextInput
              mono
              value={value.name}
              onChange={(v) => set("name", v)}
              placeholder={t("editor.namePlaceholder")}
              aria-label={t("editor.name")}
            />
          </FormField>
        </div>
        <div style={s.type}>
          <FormField label={t("editor.type")}>
            <SelectInput
              value={value.type}
              onChange={(v) => set("type", v as SkillType)}
              options={SKILL_TYPES.map((ty) => ({ value: ty, label: t(`listItem.type.${ty}`) }))}
            />
          </FormField>
        </div>
      </div>
      <FormField label={t("editor.description")} required hint={t("editor.descriptionHint")}>
        <Textarea
          rows={2}
          value={value.description}
          onChange={(v) => set("description", v)}
          placeholder={t("editor.descriptionPlaceholder")}
        />
      </FormField>
      <FormField
        label={t("editor.body")}
        required
        hint={t("editor.bodyHint")}
        right={
          <div style={s.modeSwitch}>
            <Chip active={mode === "write"} onClick={() => setMode("write")}>
              {t("editor.write")}
            </Chip>
            <Chip active={mode === "preview"} onClick={() => setMode("preview")}>
              {t("editor.preview")}
            </Chip>
          </div>
        }
      >
        {mode === "write" ? (
          <Textarea
            mono
            rows={14}
            value={value.body}
            onChange={(v) => set("body", v)}
            placeholder={t("editor.bodyPlaceholder")}
          />
        ) : (
          <div style={s.preview}>
            <Markdown>{value.body}</Markdown>
          </div>
        )}
      </FormField>
    </div>
  );
}
