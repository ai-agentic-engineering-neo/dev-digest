/* SkillEditorDrawer — create a skill by writing it, or import one from a file. Editing lives in the Config tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { EMPTY_VALUES, validateSkillForm, type FieldErrors, type SkillFormValues } from "@/lib/skill-form";
import { getErrorMessage, useCreateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { ImportTab } from "./_components/ImportTab";
import { SkillForm } from "./_components/SkillForm";

export type EditorTabKey = "create" | "file";

interface Props {
  initialTab?: EditorTabKey;
  onClose: () => void;
  /** Called after a skill was created or imported (the drawer is then closed by the caller). */
  onCreated?: (skill: Skill) => void;
}

export function SkillEditorDrawer({ initialTab = "create", onClose, onCreated }: Props) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const [tab, setTab] = React.useState<EditorTabKey>(initialTab);
  const [values, setValues] = React.useState<SkillFormValues>(EMPTY_VALUES);
  const [errors, setErrors] = React.useState<FieldErrors>({});

  const done = (skill: Skill) => {
    onCreated?.(skill);
    onClose();
  };

  const save = () => {
    const found = validateSkillForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    create.mutate(
      { ...values, source: "manual" },
      {
        onSuccess: (sk) => {
          toast.success(t("editor.created", { name: sk.name }));
          done(sk);
        },
        onError: (err) => toast.error(getErrorMessage(err, t("editor.saveFailed"))),
      },
    );
  };

  return (
    <Drawer
      width={640}
      title={t("drawer.title")}
      subtitle={t("drawer.subtitle")}
      onClose={onClose}
      footer={
        tab === "create" && (
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button kind="secondary" onClick={onClose}>
              {t("editor.cancel")}
            </Button>
            <Button kind="primary" onClick={save} loading={create.isPending}>
              {create.isPending ? t("editor.saving") : t("editor.save")}
            </Button>
          </div>
        )
      }
    >
      <div style={{ margin: "-24px -24px 20px" }}>
        <Tabs
          pad="0 24px"
          value={tab}
          onChange={(k) => setTab(k as EditorTabKey)}
          tabs={[
            { key: "create", label: t("drawer.tabs.create"), icon: "Edit" },
            { key: "file", label: t("drawer.tabs.file"), icon: "Upload" },
          ]}
        />
      </div>
      {tab === "create" ? (
        <SkillForm values={values} errors={errors} onChange={(patch) => setValues({ ...values, ...patch })} />
      ) : (
        <ImportTab onDone={done} />
      )}
    </Drawer>
  );
}
