"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { SkillForm, type SkillFormValue } from "../../../SkillForm";
import { s } from "./styles";

const MODAL_WIDTH = 680;

/** Create-skill modal — name / description / type / Markdown body. */
export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();
  const [form, setForm] = React.useState<SkillFormValue>({
    name: "",
    description: "",
    type: "custom",
    body: t("create.defaultBody"),
    enabled: true,
  });

  const submit = async () => {
    const skill = await create.mutateAsync({ ...form, name: form.name.trim() });
    onClose();
    router.push(`/skills/${skill.id}`);
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
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending || !form.name.trim() || !form.body.trim()}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <SkillForm value={form} onChange={setForm} />
      </div>
    </Modal>
  );
}
