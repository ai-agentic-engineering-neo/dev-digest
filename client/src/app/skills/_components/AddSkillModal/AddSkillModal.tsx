/* AddSkillModal — "Add skill": Create from scratch or import a .md / .zip.
   Both paths end in POST /skills; import only after the user confirms the preview. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useCreateSkill } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { SkillFields, isSkillValid, type SkillFieldValues } from "../SkillFields";
import { ImportFromFile } from "./_components/ImportFromFile";
import { ADD_TABS, EMPTY_SKILL, type AddSkillTab } from "./constants";
import { s } from "./styles";

export function AddSkillModal({
  initialTab = "create",
  onClose,
  onCreated,
}: {
  initialTab?: AddSkillTab;
  onClose: () => void;
  onCreated: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const [tab, setTab] = React.useState<AddSkillTab>(initialTab);
  const [draft, setDraft] = React.useState<SkillFieldValues>(EMPTY_SKILL);

  const submit = () =>
    create.mutate(
      { ...draft, name: draft.name.trim(), source: "manual", enabled: true },
      {
        onSuccess: (skill) => {
          toast.success(t("add.created", { name: skill.name }));
          onCreated(skill);
        },
      },
    );

  const tabs = ADD_TABS.map((k) => ({ key: k, label: t(`add.tabs.${k}`) }));

  return (
    <Modal
      width={640}
      title={t("add.title")}
      onClose={onClose}
      footer={
        tab === "create" ? (
          <Button kind="primary" icon="Check" full onClick={submit} disabled={!isSkillValid(draft) || create.isPending}>
            {create.isPending ? t("add.creating") : t("add.create")}
          </Button>
        ) : undefined
      }
    >
      <div style={s.tabs}>
        <Tabs tabs={tabs} value={tab} onChange={(k) => setTab(k as AddSkillTab)} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "create" ? (
          <SkillFields value={draft} onChange={setDraft} bodyRows={10} showBodyHint={false} />
        ) : (
          <ImportFromFile onCreated={onCreated} />
        )}
      </div>
    </Modal>
  );
}
