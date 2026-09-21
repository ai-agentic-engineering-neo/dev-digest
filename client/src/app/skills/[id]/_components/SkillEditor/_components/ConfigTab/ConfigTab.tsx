"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Icon, SelectInput, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { TYPE_OPTIONS } from "./constants";
import { estimateTokens, slugify } from "./helpers";
import { s } from "./styles";

/** Config tab — name/description/type + enabled toggle, and the "Skill body"
    panel: a plain monospace textarea (NOT a real code editor — no line
    numbers, no syntax highlighting). Mirrors the Agent Editor ConfigTab's
    local-state-per-field pattern. */
export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);
  const [changeNote, setChangeNote] = React.useState("");

  // Reset local form when switching skills (or after a version restore swaps
  // the loaded skill's body/version under us).
  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
    setChangeNote("");
  }, [skill.id, skill.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const bodyChanged = body !== skill.body;
  const tokens = estimateTokens(body);

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
          ...(bodyChanged && changeNote.trim() ? { change_note: changeNote.trim() } : {}),
        },
      },
      {
        onSuccess: (data) => {
          setChangeNote("");
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
      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={setName} />
      </FormField>
      <FormField label={t("config.description")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput
          value={type}
          onChange={(v) => setType(v as SkillType)}
          options={TYPE_OPTIONS.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }))}
        />
      </FormField>
      <FormField label={t("config.bodyPanelTitle")}>
        <div style={s.bodyPanel}>
          <div style={s.bodyPanelHeader}>
            <Icon.File size={13} style={{ color: "var(--text-muted)" }} />
            <span className="mono" style={s.bodyFilename}>
              {slugify(name)}.md
            </span>
            {bodyChanged && <Badge color="var(--warn)">{t("config.unsaved")}</Badge>}
            <span className="mono" style={s.bodyTokens}>
              {t("config.tokens", { count: tokens })}
            </span>
          </div>
          <Textarea value={body} onChange={setBody} rows={16} mono />
        </div>
      </FormField>
      {bodyChanged && (
        <div style={s.changeNoteField}>
          <FormField label={t("config.changeNoteLabel")}>
            <TextInput
              value={changeNote}
              onChange={setChangeNote}
              placeholder={t("config.changeNotePlaceholder")}
            />
          </FormField>
        </div>
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
