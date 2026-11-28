/* CreateSkillModal — a new skill from scratch (source `manual`, v1). A server
   error, e.g. a taken name, stays inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useCreateSkill } from "@/lib/hooks/skills";
import { SkillFields } from "../SkillFields";
import { EMPTY_DRAFT, SKILL_FORM_MODAL_WIDTH } from "../../constants";
import { canSaveDraft, type SkillDraft } from "../../helpers";
import { s } from "./styles";

export function CreateSkillModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTranslations("skills");
  const create = useCreateSkill();
  const [draft, setDraft] = React.useState<SkillDraft>({ ...EMPTY_DRAFT });

  const submit = () => create.mutate(draft, { onSuccess: (skill) => onCreated(skill.id) });

  return (
    <Modal
      width={SKILL_FORM_MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Plus"
            loading={create.isPending}
            disabled={!canSaveDraft(draft)}
            onClick={submit}
          >
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {create.error && (
          <div role="alert" style={s.error}>
            {create.error.message}
          </div>
        )}
        <SkillFields value={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
      </div>
    </Modal>
  );
}
