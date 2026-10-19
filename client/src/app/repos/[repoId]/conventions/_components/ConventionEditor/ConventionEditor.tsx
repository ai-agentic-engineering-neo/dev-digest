/* ConventionEditor — inline "Edit first" form on a card: rule, category and
   evidence snippet. Saving also accepts the candidate. Mount with key={id}. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, SelectInput, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";
import { CONVENTION_CATEGORIES } from "../../constants";
import { s } from "./styles";

export interface ConventionEdit {
  rule: string;
  category: ConventionCategory;
  evidence_snippet: string;
}

export function ConventionEditor({
  convention,
  saving,
  onSave,
  onCancel,
}: {
  convention: ConventionCandidate;
  saving?: boolean;
  onSave: (patch: ConventionEdit) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("conventions");
  const [draft, setDraft] = React.useState<ConventionEdit>({
    rule: convention.rule,
    category: convention.category,
    evidence_snippet: convention.evidence_snippet,
  });
  const set = <K extends keyof ConventionEdit>(key: K, v: ConventionEdit[K]) => setDraft((d) => ({ ...d, [key]: v }));
  const valid = draft.rule.trim() !== "";

  return (
    <div style={s.form}>
      <div style={s.row}>
        <div style={s.grow}>
          <FormField label={t("editor.rule")} required>
            <Textarea rows={2} value={draft.rule} onChange={(v) => set("rule", v)} />
          </FormField>
        </div>
        <div style={s.category}>
          <FormField label={t("editor.category")}>
            <SelectInput
              mono={false}
              value={draft.category}
              onChange={(v) => set("category", v as ConventionCategory)}
              options={CONVENTION_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
            />
          </FormField>
        </div>
      </div>
      <FormField label={t("editor.snippet")}>
        <Textarea mono rows={4} value={draft.evidence_snippet} onChange={(v) => set("evidence_snippet", v)} />
      </FormField>
      <div style={s.actions}>
        <Button size="sm" kind="ghost" onClick={onCancel} disabled={saving}>
          {t("editor.cancel")}
        </Button>
        <Button
          size="sm"
          kind="primary"
          icon="Check"
          loading={saving}
          disabled={!valid || saving}
          onClick={() => onSave({ ...draft, rule: draft.rule.trim() })}
        >
          {t("editor.save")}
        </Button>
      </div>
    </div>
  );
}
