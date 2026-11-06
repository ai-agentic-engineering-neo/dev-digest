"use client";

import React, { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { IntentOverrideInput } from "@/lib/types";
import { INTENT_MAX_CHARS, SCOPE_MAX_ITEMS } from "../../constants";
import { itemsToLines, linesToItems } from "../../helpers";
import { s } from "./styles";

export function IntentEditForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: IntentOverrideInput;
  saving: boolean;
  onSave: (input: IntentOverrideInput) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("brief");
  const uid = useId();
  const [intent, setIntent] = useState(initial.intent);
  const [inScope, setInScope] = useState(itemsToLines(initial.in_scope));
  const [outScope, setOutScope] = useState(itemsToLines(initial.out_of_scope));

  const inParsed = linesToItems(inScope, SCOPE_MAX_ITEMS);
  const outParsed = linesToItems(outScope, SCOPE_MAX_ITEMS);
  const intentText = intent.trim();
  const canSave = intentText.length > 0 && !inParsed.tooMany && !outParsed.tooMany && !saving;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    onSave({ intent: intentText, in_scope: inParsed.items, out_of_scope: outParsed.items });
  }

  const inErrId = `${uid}-in-err`;
  const outErrId = `${uid}-out-err`;

  return (
    <form style={s.form} onSubmit={handleSubmit}>
      <div style={s.field}>
        <label htmlFor={`${uid}-intent`} style={s.label}>
          {t("intent.form.intent")}
        </label>
        <textarea
          id={`${uid}-intent`}
          style={s.textarea}
          rows={3}
          maxLength={INTENT_MAX_CHARS}
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
        />
      </div>
      <div style={s.field}>
        <label htmlFor={`${uid}-in`} style={s.label}>
          {t("intent.form.inScope")}
        </label>
        <textarea
          id={`${uid}-in`}
          style={s.textarea}
          rows={3}
          value={inScope}
          aria-invalid={inParsed.tooMany}
          aria-describedby={inParsed.tooMany ? inErrId : undefined}
          onChange={(e) => setInScope(e.target.value)}
        />
        {inParsed.tooMany && (
          <span id={inErrId} style={s.error}>
            {t("intent.form.tooManyItems", { max: SCOPE_MAX_ITEMS })}
          </span>
        )}
      </div>
      <div style={s.field}>
        <label htmlFor={`${uid}-out`} style={s.label}>
          {t("intent.form.outOfScope")}
        </label>
        <textarea
          id={`${uid}-out`}
          style={s.textarea}
          rows={3}
          value={outScope}
          aria-invalid={outParsed.tooMany}
          aria-describedby={outParsed.tooMany ? outErrId : undefined}
          onChange={(e) => setOutScope(e.target.value)}
        />
        {outParsed.tooMany && (
          <span id={outErrId} style={s.error}>
            {t("intent.form.tooManyItems", { max: SCOPE_MAX_ITEMS })}
          </span>
        )}
      </div>
      <p style={s.hint}>{t("intent.form.hint")}</p>
      <div style={s.actions}>
        <Button type="submit" kind="primary" size="sm" disabled={!canSave}>
          {saving ? t("intent.form.saving") : t("intent.form.save")}
        </Button>
        <Button type="button" kind="ghost" size="sm" onClick={onCancel}>
          {t("intent.form.cancel")}
        </Button>
      </div>
    </form>
  );
}
