/* CreateSkillModal — create a skill from scratch (editing happens in the
   editor's Config tab). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { ApiError } from "../../../../../../lib/api";
import { SkillForm, isDraftValid, type SkillDraft } from "../SkillForm";
import { s } from "./styles";

const EMPTY: SkillDraft = { name: "", description: "", type: "rubric", body: "" };

export function CreateSkillModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: Skill) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const [draft, setDraft] = React.useState<SkillDraft>(EMPTY);

  const save = () =>
    create.mutate(
      { name: draft.name.trim(), description: draft.description.trim(), type: draft.type, body: draft.body },
      {
        onSuccess: (saved) => {
          toast.success(t("editor.created", { name: saved.name }));
          onCreated(saved);
        },
      },
    );

  return (
    <Modal
      width={760}
      title={t("editor.createTitle")}
      subtitle={t("editor.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {create.error && (
            <span role="alert" style={s.error}>
              {create.error instanceof ApiError ? create.error.message : String(create.error)}
            </span>
          )}
          <Button kind="ghost" onClick={onClose}>
            {t("editor.cancel")}
          </Button>
          <Button
            kind="primary"
            onClick={save}
            loading={create.isPending}
            disabled={!isDraftValid(draft) || create.isPending}
          >
            {t("editor.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <SkillForm value={draft} onChange={setDraft} />
      </div>
    </Modal>
  );
}
