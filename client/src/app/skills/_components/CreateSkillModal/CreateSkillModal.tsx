/* CreateSkillModal — "Create from scratch": name · description · type · body.
   `source` is always `manual` (set by the server). On success → the new skill's Config tab. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useCreateSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { hasErrors, skillHref, validateSkillForm, type SkillFormValues } from "../helpers";
import { SkillFormFields } from "../SkillFormFields";
import { EMPTY_FORM, MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkill();
  const [form, setForm] = React.useState<SkillFormValues>(EMPTY_FORM);
  // Errors show only after the first submit attempt; a 409 marks the name that clashed.
  const [attempted, setAttempted] = React.useState(false);
  const [takenName, setTakenName] = React.useState<string | null>(null);

  const errors = validateSkillForm(form);
  if (!errors.name && takenName === form.name) errors.name = { key: "nameTaken" };
  const shownErrors = attempted ? errors : {};

  const setField = <K extends keyof SkillFormValues>(field: K, value: SkillFormValues[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async () => {
    setAttempted(true);
    if (hasErrors(errors)) return;
    let skill;
    try {
      skill = await create.mutateAsync({
        name: form.name,
        description: form.description,
        type: form.type,
        body: form.body,
      });
    } catch (err) {
      // Other failures are toasted by the global MutationCache (lib/providers.tsx).
      if (err instanceof ApiError && err.status === 409) setTakenName(form.name);
      return;
    }
    toast.success(t("create.createdToast", { name: skill.name }));
    onClose();
    router.push(skillHref(skill.id, "config", { suggestAgents: true }));
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <SkillFormFields values={form} errors={shownErrors} onChange={setField} bodyRows={10} />
      </div>
    </Modal>
  );
}
