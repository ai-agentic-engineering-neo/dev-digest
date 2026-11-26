/* MergeForm — merge the selected accepted conventions into ONE existing skill.
   Name, description and type are the skill's own (read-only). The server skips
   duplicates and returns conflicts, which the skill's Config tab then shows. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField } from "@devdigest/ui";
import type { ConventionCandidate, Skill } from "@devdigest/shared";
import { useToast } from "@/lib/toast";
import { useCreateSkillFromConventions } from "@/lib/hooks/conventions";
import { skillConfigHref } from "@/app/repos/[repoId]/conventions/helpers";
import { s as parent } from "../../styles";
import { s } from "./styles";

export interface MergeFormProps {
  repoId: string;
  repoName: string;
  conventions: ConventionCandidate[];
  skill: Skill;
  onClose: () => void;
}

export function MergeForm({ repoId, repoName, conventions, skill, onClose }: MergeFormProps) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const toast = useToast();
  const merge = useCreateSkillFromConventions(repoId);

  const submit = async () => {
    try {
      const res = await merge.mutateAsync({
        convention_ids: conventions.map((c) => c.id),
        // Ignored by the server on a merge; required by the contract.
        name: skill.name,
        target: { mode: "merge", skill_id: skill.id },
      });
      toast.success(
        t("merge.doneToast", {
          name: res.skill.name,
          added: res.added,
          duplicates: res.duplicates,
          conflicts: res.conflicts.length,
        }),
      );
      onClose();
      router.push(skillConfigHref(res.skill.id));
    } catch {
      // The global MutationCache toasts it (404, 409 "changed while merging", …).
    }
  };

  return (
    <>
      <div style={parent.banner}>
        {t("merge.banner", { count: conventions.length, repo: repoName, name: skill.name })}
      </div>

      <dl style={s.facts} aria-label={t("merge.fromSkill")}>
        <dt style={s.term}>{t("create.name")}</dt>
        <dd style={s.mono}>{skill.name}</dd>
        <dt style={s.term}>{t("create.description")}</dt>
        <dd style={s.value}>{skill.description || "—"}</dd>
        <dt style={s.term}>{t("create.type")}</dt>
        <dd style={s.value}>{skill.type}</dd>
      </dl>

      <FormField label={t("merge.rules")} hint={t("merge.note")}>
        <ul style={s.rules}>
          {conventions.map((c) => (
            <li key={c.id} style={s.rule}>
              {c.rule}
            </li>
          ))}
        </ul>
      </FormField>

      <div style={parent.footer}>
        <span style={parent.muted}>{t("merge.footer", { version: skill.version + 1 })}</span>
        <div style={parent.footerActions}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="GitMerge" loading={merge.isPending} onClick={submit}>
            {merge.isPending ? t("merge.merging") : t("merge.submit")}
          </Button>
        </div>
      </div>
    </>
  );
}
