/* ConfigTab — name / description / type / enabled + the body editor, over the
   editor's draft (useSkillDraft). Save sends only the changed fields, plus
   base_version when the body or description changed; a 409 stale_version keeps
   the draft (the hook refetches the live skill). Danger zone: delete. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, SectionLabel, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { isStaleVersionError, useUpdateSkill } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { isValidSkillName, skillsHref } from "@/app/skills/helpers";
import { DeleteSkillModal } from "@/app/skills/_components/DeleteSkillModal";
import { ImportedBanner } from "@/app/skills/_components/ImportedBanner";
import { SkillMetaFields } from "@/app/skills/_components/SkillMetaFields";
import type { SkillDraftState } from "../../useSkillDraft";
import { BodyEditor } from "../BodyEditor";
import { s } from "./styles";

export function ConfigTab({ skill, draft }: { skill: Skill; draft: SkillDraftState }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const update = useUpdateSkill();
  const [deleting, setDeleting] = React.useState(false);
  const { form, dirty, versioned, patch, edit, reset } = draft;
  const valid = isValidSkillName(form.name) && form.body.trim().length > 0;

  const save = () =>
    update.mutate(
      { id: skill.id, patch },
      {
        onSuccess: (saved) => {
          reset();
          toast.success(
            saved.version > skill.version ? t("config.savedVersion", { version: saved.version }) : t("config.saved"),
          );
        },
        onError: (err) => {
          if (isStaleVersionError(err)) toast.error(t("config.stale"));
        },
      },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={form.enabled} onChange={(v) => edit("enabled", v)} size={16} />
        </label>
      </div>
      <ImportedBanner skill={skill} />
      <SkillMetaFields value={form} onChange={(key, v) => edit(key, v)} />
      <FormField label={t("fields.body")} required hint={t("fields.bodyHint")}>
        <BodyEditor
          name={form.name}
          value={form.body}
          onChange={(v) => edit("body", v)}
          dirty={form.body !== skill.body}
        />
      </FormField>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={!dirty || !valid || update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        <Button kind="ghost" onClick={reset} disabled={!dirty || update.isPending}>
          {t("config.cancel")}
        </Button>
        {versioned && <span style={s.note}>{t("config.snapshotNote", { version: skill.version + 1 })}</span>}
      </div>

      <section style={s.danger}>
        <SectionLabel icon="AlertTriangle">{t("config.dangerZone")}</SectionLabel>
        <div style={s.dangerRow}>
          <span style={s.dangerBody}>{t("config.dangerBody")}</span>
          <Button kind="danger" icon="Trash" onClick={() => setDeleting(true)}>
            {t("config.delete")}
          </Button>
        </div>
      </section>
      {deleting && (
        <DeleteSkillModal skill={skill} onClose={() => setDeleting(false)} onDeleted={() => router.push(skillsHref())} />
      )}
    </div>
  );
}
