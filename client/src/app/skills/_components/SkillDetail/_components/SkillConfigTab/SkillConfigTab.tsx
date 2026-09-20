/* SkillConfigTab — edit a skill: name, description, type, markdown body (line gutter, token estimate). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Toggle } from "@devdigest/ui";
import { SKILL_TYPES, estimateTokens } from "@/lib/skills";
import type { Skill, SkillType } from "@devdigest/shared";
import { getErrorMessage, useDeleteSkill, useUpdateSkill } from "@/lib/hooks/skills";
import {
  SKILL_FIELD_MAX,
  changedFields,
  validateSkillForm,
  valuesFromSkill,
  type FieldErrors,
  type SkillFormValues,
} from "@/lib/skill-form";
import { useToast } from "@/lib/toast";
import { fileNameFor, lineNumbers } from "./helpers";
import { s } from "./styles";

interface Props {
  skill: Skill;
  onDeleted: (id: string) => void;
}

export function SkillConfigTab({ skill, onDeleted }: Props) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const uid = React.useId();
  const [baseline, setBaseline] = React.useState<SkillFormValues>(() => valuesFromSkill(skill));
  const [values, setValues] = React.useState<SkillFormValues>(baseline);
  const gutterRef = React.useRef<HTMLDivElement>(null);

  const patch = changedFields(values, baseline);
  const dirty = Object.keys(patch).length > 0;
  const allErrors = validateSkillForm(values);
  // Only surface errors for fields the user changed; an untouched field never shouts.
  const errors: FieldErrors = {};
  for (const key of Object.keys(patch) as (keyof SkillFormValues)[]) {
    if (allErrors[key]) errors[key] = allErrors[key];
  }
  const valid = Object.keys(allErrors).length === 0;

  const set = (next: Partial<SkillFormValues>) => setValues((v) => ({ ...v, ...next }));

  const save = () => {
    if (!dirty || !valid) return;
    update.mutate(
      { id: skill.id, patch },
      {
        onSuccess: (saved) => {
          const next = valuesFromSkill(saved);
          setBaseline(next);
          setValues(next);
          toast.success(t("editor.updated", { name: saved.name }));
        },
        onError: (err) => toast.error(getErrorMessage(err, t("editor.saveFailed"))),
      },
    );
  };

  const toggleEnabled = (enabled: boolean) =>
    update.mutate(
      { id: skill.id, patch: { enabled } },
      { onError: (err) => toast.error(getErrorMessage(err, t("page.updateFailed"))) },
    );

  const remove = () => {
    if (!window.confirm(t("preview.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("page.deleted"));
        onDeleted(skill.id);
      },
      onError: (err) => toast.error(getErrorMessage(err, t("preview.deleteFailed"))),
    });
  };

  const counter = (f: keyof typeof SKILL_FIELD_MAX) => (
    <span style={values[f].length > SKILL_FIELD_MAX[f] ? s.counterOver : s.counter}>
      {t("editor.fields.counter", { count: values[f].length, max: SKILL_FIELD_MAX[f] })}
    </span>
  );
  const error = (f: keyof SkillFormValues, id: string) => {
    const e = errors[f];
    return e ? (
      <div id={id} role="alert" style={s.error}>
        {t(`editor.errors.${e.code}`, { max: e.max ?? 0 })}
      </div>
    ) : null;
  };
  const label = (id: string, text: string, right?: React.ReactNode) => (
    <div style={s.labelRow}>
      <label htmlFor={id} style={s.label}>
        {text}
        <span style={s.required} aria-hidden="true">
          *
        </span>
      </label>
      {right}
    </div>
  );

  const ids = { name: `${uid}-name`, desc: `${uid}-desc`, type: `${uid}-type`, body: `${uid}-body` };
  const lines = lineNumbers(values.body);

  return (
    <div>
      <div style={s.head}>
        <h3 style={s.title}>{t("config.title")}</h3>
        <Badge mono icon="GitCommit">
          {t("preview.version", { version: skill.version })}
        </Badge>
        <div style={s.enabled}>
          <span>{t("preview.enabled")}</span>
          <span role="group" aria-label={t("card.enabledLabel", { name: skill.name })}>
            <Toggle on={skill.enabled} onChange={toggleEnabled} />
          </span>
        </div>
      </div>

      <div style={s.group}>
        {label(ids.name, t("editor.fields.name"), counter("name"))}
        <input
          id={ids.name}
          className="mono"
          style={s.input}
          value={values.name}
          placeholder={t("editor.fields.namePlaceholder")}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? `${ids.name}-err` : undefined}
          onChange={(e) => set({ name: e.target.value })}
        />
        {error("name", `${ids.name}-err`)}
      </div>

      <div style={s.group}>
        <div style={s.labelRow}>
          <label htmlFor={ids.desc} style={s.label}>
            {t("editor.fields.description")}
          </label>
          {counter("description")}
        </div>
        <textarea
          id={ids.desc}
          rows={2}
          style={s.textarea}
          value={values.description}
          placeholder={t("editor.fields.descriptionPlaceholder")}
          aria-invalid={!!errors.description}
          aria-describedby={`${ids.desc}-hint${errors.description ? ` ${ids.desc}-err` : ""}`}
          onChange={(e) => set({ description: e.target.value })}
        />
        {error("description", `${ids.desc}-err`)}
        <div id={`${ids.desc}-hint`} style={s.hint}>
          {t("editor.fields.descriptionHint")}
        </div>
      </div>

      <div style={s.group}>
        <div style={s.labelRow}>
          <label htmlFor={ids.type} style={s.label}>
            {t("editor.fields.type")}
          </label>
        </div>
        <div style={s.selectWrap}>
          <select
            id={ids.type}
            className="mono"
            style={s.select}
            value={values.type}
            onChange={(e) => set({ type: e.target.value as SkillType })}
          >
            {SKILL_TYPES.map((v) => (
              <option key={v} value={v}>
                {t(`listItem.type.${v}`)}
              </option>
            ))}
          </select>
          <Icon.ChevronsUpDown size={14} style={s.selectIcon} />
        </div>
      </div>

      <div style={s.group}>
        {label(ids.body, t("config.bodyLabel"), counter("body"))}
        <div style={errors.body ? s.editorInvalid : s.editor}>
          <div style={s.fileBar}>
            <Icon.FileText size={14} style={s.fileIcon} />
            <span className="mono" style={s.fileName}>
              {fileNameFor(values.name)}
            </span>
            {dirty && <Badge>{t("config.unsaved")}</Badge>}
            <span className="mono" style={s.tokens}>
              {t("config.tokens", { count: estimateTokens(values.body) })}
            </span>
          </div>
          <div style={s.code}>
            <div ref={gutterRef} aria-hidden="true" data-testid="line-gutter" className="mono" style={s.gutter}>
              {lines.map((n) => (
                <div key={n}>{n}</div>
              ))}
            </div>
            <textarea
              id={ids.body}
              className="mono"
              style={s.bodyArea}
              wrap="off"
              spellCheck={false}
              value={values.body}
              placeholder={t("editor.fields.bodyPlaceholder")}
              aria-invalid={!!errors.body}
              aria-describedby={errors.body ? `${ids.body}-err` : undefined}
              onChange={(e) => set({ body: e.target.value })}
              onScroll={(e) => {
                if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
              }}
            />
          </div>
        </div>
        {error("body", `${ids.body}-err`)}
      </div>

      <div style={s.actions}>
        <Button kind="primary" onClick={save} disabled={!dirty || !valid} loading={update.isPending}>
          {update.isPending ? t("editor.saving") : t("preview.save")}
        </Button>
        <Button kind="secondary" onClick={() => setValues(baseline)} disabled={!dirty}>
          {t("config.discard")}
        </Button>
        <span style={s.spacer} />
        <Button kind="secondary" icon="Trash" onClick={remove} loading={del.isPending}>
          {t("preview.delete")}
        </Button>
      </div>
    </div>
  );
}
