/* ConfigTab — edit name / description / type / body. A changed body is saved as
   a new immutable version (server rule); other fields keep the version. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { SkillFields, isSkillValid, type SkillFieldValues } from "../../../../../_components/SkillFields";
import { isImported } from "../../../../../_components/SkillCard";
import { s } from "./styles";

function toValues(skill: Skill): SkillFieldValues {
  return { name: skill.name, description: skill.description, type: skill.type, body: skill.body };
}

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [draft, setDraft] = React.useState<SkillFieldValues>(() => toValues(skill));

  // Reset when switching skills or when the version moves (e.g. a restore).
  React.useEffect(() => {
    setDraft(toValues(skill));
  }, [skill.id, skill.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const saved = toValues(skill);
  const dirty = (Object.keys(saved) as (keyof SkillFieldValues)[]).some((k) => saved[k] !== draft[k]);

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { ...draft, name: draft.name.trim() } },
      { onSuccess: (data) => toast.success(t("editor.savedToast", { version: data.version })) },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{skill.name}</h2>
        <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={!dirty || !isSkillValid(draft) || update.isPending}>
          {update.isPending ? t("editor.saving") : t("editor.save")}
        </Button>
      </div>
      {isImported(skill) && (
        <div style={s.notice} role="note">
          <Icon.AlertTriangle size={16} style={s.noticeIcon} />
          <span>{t("editor.untrustedNotice")}</span>
        </div>
      )}
      <SkillFields value={draft} onChange={setDraft} />
    </div>
  );
}
