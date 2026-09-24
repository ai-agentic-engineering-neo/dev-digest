/* CreateSkillModal — blank form (name, description, type, body) → POST /skills
   → the new skill's editor (via onCreated when the host must guard the
   navigation, e.g. a dirty skill editor). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, Textarea } from "@devdigest/ui";
import { useCreateSkill } from "@/lib/hooks";
import { isValidSkillName, skillHref } from "../../helpers";
import { SkillMetaFields, type SkillMetaValue } from "../SkillMetaFields";
import { s } from "./styles";

export function CreateSkillModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();
  const [meta, setMeta] = React.useState<SkillMetaValue>({ name: "", description: "", type: "custom" });
  const [body, setBody] = React.useState(() => t("create.defaultBody"));
  const valid = isValidSkillName(meta.name) && body.trim().length > 0;

  const submit = () =>
    create.mutate(
      { ...meta, description: meta.description.trim(), body, source: "manual", enabled: true },
      {
        onSuccess: (skill) => {
          onClose();
          if (onCreated) onCreated(skill.id);
          else router.push(skillHref(skill.id));
        },
      },
    );

  return (
    <Modal
      width={640}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={!valid || create.isPending}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <SkillMetaFields value={meta} onChange={(key, v) => setMeta((m) => ({ ...m, [key]: v }))} />
        <FormField label={t("fields.body")} required hint={t("fields.bodyHint")}>
          <Textarea value={body} onChange={setBody} rows={8} mono placeholder={t("create.bodyPlaceholder")} />
        </FormField>
      </div>
    </Modal>
  );
}
