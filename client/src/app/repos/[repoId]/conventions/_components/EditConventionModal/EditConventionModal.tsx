/* EditConventionModal — edit a rule before (or after) accepting it: text,
   category, counter-example, and drop evidence. Evidence code is read from the
   repo and verified, so it can be removed but not rewritten. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";
import { useUpdateConvention } from "@/lib/hooks/conventions";
import { CONVENTION_CATEGORIES } from "../../constants";
import { evidenceLabel, evidenceOf } from "../../helpers";
import { buildPatch, canRemove, formFrom, type EditForm } from "./helpers";
import { s } from "./styles";

export function EditConventionModal({
  repoId,
  candidate,
  onClose,
}: {
  repoId: string;
  candidate: ConventionCandidate;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const update = useUpdateConvention(repoId);
  const [form, setForm] = React.useState<EditForm>(() => formFrom(candidate));
  const evidence = evidenceOf(candidate);
  const ruleEmpty = form.rule.trim().length === 0;

  const toggleRemoved = (i: number) =>
    setForm((f) => ({
      ...f,
      removed: f.removed.includes(i) ? f.removed.filter((x) => x !== i) : [...f.removed, i],
    }));

  const save = async () => {
    if (ruleEmpty) return;
    const patch = buildPatch(candidate, form);
    if (!patch) return onClose();
    try {
      await update.mutateAsync({ id: candidate.id, patch });
      onClose();
    } catch {
      // The global mutation toast reports the error; keep the modal open.
    }
  };

  return (
    <Modal
      width={640}
      title={t("edit.title")}
      onClose={onClose}
      footer={
        <>
          <Button kind="ghost" onClick={onClose}>
            {t("edit.cancel")}
          </Button>
          <Button kind="primary" loading={update.isPending} disabled={ruleEmpty} onClick={save}>
            {update.isPending ? t("edit.saving") : t("edit.save")}
          </Button>
        </>
      }
    >
      <div style={s.body}>
        <FormField label={t("edit.rule")} required>
          <Textarea rows={2} value={form.rule} onChange={(v) => setForm((f) => ({ ...f, rule: v }))} />
          {ruleEmpty && <p style={s.error}>{t("edit.ruleRequired")}</p>}
        </FormField>

        <FormField label={t("edit.category")}>
          <SelectInput
            value={form.category}
            onChange={(v) => setForm((f) => ({ ...f, category: v as ConventionCategory }))}
            options={CONVENTION_CATEGORIES.map((c) => ({ value: c, label: t(`card.categories.${c}`) }))}
          />
        </FormField>

        <FormField label={t("edit.badExample")}>
          <Textarea
            mono
            rows={4}
            value={form.badExample}
            onChange={(v) => setForm((f) => ({ ...f, badExample: v }))}
          />
        </FormField>

        <FormField label={t("edit.evidence")} hint={t("edit.evidenceHint")}>
          <div style={s.evidenceList}>
            {evidence.map((e, i) => {
              const removed = form.removed.includes(i);
              return (
                <div key={`${e.path}:${e.line_start}`} style={s.evidenceRow(removed)}>
                  <span style={s.evidencePath}>{evidenceLabel(e)}</span>
                  <Button
                    kind="ghost"
                    size="sm"
                    disabled={!canRemove(evidence.length, form.removed, i)}
                    onClick={() => toggleRemoved(i)}
                  >
                    {removed ? t("edit.undoRemove") : t("edit.remove")}
                  </Button>
                </div>
              );
            })}
          </div>
        </FormField>
      </div>
    </Modal>
  );
}
