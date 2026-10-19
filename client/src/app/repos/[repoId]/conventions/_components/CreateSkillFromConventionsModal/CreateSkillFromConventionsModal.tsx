/* CreateSkillFromConventionsModal — compose ONE skill from the accepted
   conventions: pick which to include (regenerates the body), edit name /
   description / type / body, optionally attach it to agents, then save
   (POST /skills, source "extracted") or cancel. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, FormField, Modal } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { useAgents } from "@/lib/hooks/agents";
import { useAttachSkillToAgents, useCreateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import {
  SkillForm,
  isDraftValid,
  type SkillDraft,
} from "@/app/skills/_components/SkillsWorkspace/_components/SkillForm";
import { buildSkillBody, evidenceFiles, type BodyLabels } from "./helpers";
import { s } from "./styles";

export function CreateSkillFromConventionsModal({
  repoName,
  conventions,
  onClose,
}: {
  repoName: string;
  conventions: ConventionCandidate[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const router = useRouter();
  const create = useCreateSkill();
  const attach = useAttachSkillToAgents();
  const { data: agents } = useAgents();

  const labels: BodyLabels = {
    title: t("modal.bodyTitle", { repo: repoName }),
    evidence: t("modal.evidence"),
    category: (c) => t(`categories.${c}`),
  };
  const [included, setIncluded] = React.useState<Set<string>>(() => new Set(conventions.map((c) => c.id)));
  const [draft, setDraft] = React.useState<SkillDraft>(() => ({
    name: t("modal.defaultName"),
    description: t("modal.defaultDescription", { repo: repoName }),
    type: "convention",
    body: buildSkillBody(conventions, labels),
  }));
  const [agentIds, setAgentIds] = React.useState<Set<string>>(new Set());

  const selected = conventions.filter((c) => included.has(c.id));
  const pending = create.isPending || attach.isPending;

  const toggleConvention = (id: string, on: boolean) => {
    const next = new Set(included);
    if (on) next.add(id);
    else next.delete(id);
    setIncluded(next);
    setDraft((d) => ({ ...d, body: buildSkillBody(conventions.filter((c) => next.has(c.id)), labels) }));
  };
  const toggleAgent = (id: string, on: boolean) =>
    setAgentIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const save = async () => {
    let skillId: string;
    let name: string;
    try {
      const skill = await create.mutateAsync({
        name: draft.name.trim(),
        description: draft.description.trim(),
        type: draft.type,
        body: draft.body,
        source: "extracted",
        evidence_files: evidenceFiles(selected),
      });
      skillId = skill.id;
      name = skill.name;
    } catch {
      return; // shown inline in the footer
    }
    const ids = [...agentIds];
    if (ids.length > 0) {
      try {
        await attach.mutateAsync({ skillId, agentIds: ids });
        toast.success(t("modal.savedAttached", { name, count: ids.length }));
      } catch {
        // the skill exists; the failed link is toasted globally — open the skill anyway
      }
    } else {
      toast.success(t("modal.saved", { name }));
    }
    onClose();
    router.push(`/skills/${skillId}?tab=config`);
  };

  return (
    <Modal
      width={820}
      title={t("modal.title")}
      subtitle={t("modal.subtitle")}
      onClose={pending ? undefined : onClose}
      footer={
        <div style={s.footer}>
          {create.error && (
            <span role="alert" style={s.error}>
              {create.error instanceof ApiError ? create.error.message : String(create.error)}
            </span>
          )}
          <Button kind="ghost" onClick={onClose} disabled={pending}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="primary"
            onClick={save}
            loading={pending}
            disabled={!isDraftValid(draft) || selected.length === 0 || pending}
          >
            {t("modal.save")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("modal.included")} hint={t("modal.includedHint")}>
          <div style={s.checkList}>
            {conventions.map((c) => (
              <Checkbox
                key={c.id}
                checked={included.has(c.id)}
                onChange={(on) => toggleConvention(c.id, on)}
                label={c.rule}
              />
            ))}
          </div>
        </FormField>

        <SkillForm value={draft} onChange={setDraft} />

        <FormField label={t("modal.attach")} hint={t("modal.attachHint")}>
          {agents && agents.length > 0 ? (
            <div style={s.agents}>
              {agents.map((a) => (
                <Checkbox
                  key={a.id}
                  checked={agentIds.has(a.id)}
                  onChange={(on) => toggleAgent(a.id, on)}
                  label={a.name}
                />
              ))}
            </div>
          ) : (
            <span style={s.muted}>{t("modal.noAgents")}</span>
          )}
        </FormField>
      </div>
    </Modal>
  );
}
