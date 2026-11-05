/* CreateConventionsSkillModal — "Create skill from conventions" (design 6).
   The server merges the accepted conventions into one `<repo>-conventions`
   draft; everything (name, description, type, enabled, body) is editable
   before saving. Optionally attaches the new skill to an agent. Cancel saves
   nothing. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  ErrorState,
  FormField,
  Icon,
  Modal,
  SelectInput,
  Skeleton,
  TextInput,
  Textarea,
  Toggle,
} from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "../../../../../../../../components/skill-type-badge";
import { useAgents } from "../../../../../../../../lib/hooks/agents";
import {
  useConventionsSkillDraft,
  useCreateConventionsSkill,
  type CreateConventionsSkillInput,
} from "../../../../../../../../lib/hooks/conventions";
import { useToast } from "../../../../../../../../lib/toast";
import { BODY_ROWS, MODAL_WIDTH, NO_AGENT } from "./constants";
import { approxTokens } from "@/lib/tokens";
import { canCreateSkill } from "./helpers";
import { s } from "./styles";

export function CreateConventionsSkillModal({
  repoId,
  repoName,
  acceptedCount,
  onClose,
}: {
  repoId: string;
  repoName: string;
  acceptedCount: number;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const tSkills = useTranslations("skills");
  const toast = useToast();
  const draftQ = useConventionsSkillDraft(repoId, true);
  const agentsQ = useAgents();
  const create = useCreateConventionsSkill(repoId);
  const [form, setForm] = React.useState<CreateConventionsSkillInput | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Seed the form once from the server draft; later refetches never clobber edits.
  React.useEffect(() => {
    if (draftQ.data && !form) {
      const d = draftQ.data;
      setForm({ name: d.name, description: d.description, type: d.type, body: d.body, enabled: true, agent_id: null });
    }
  }, [draftQ.data, form]);

  const set = <K extends keyof CreateConventionsSkillInput>(k: K, v: CreateConventionsSkillInput[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const submit = async () => {
    if (!form) return;
    setError(null);
    try {
      const res = await create.mutateAsync({ ...form, description: form.description.trim() });
      const agent = agentsQ.data?.find((a) => a.id === res.linked_agent_id);
      toast.success(
        agent
          ? t("modal.createdLinked", { name: res.skill.name, agent: agent.name })
          : t("modal.created", { name: res.skill.name }),
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const agentOptions = [
    { value: NO_AGENT, label: t("modal.agentNone") },
    ...(agentsQ.data ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("modal.title")}
      subtitle={form?.name ?? draftQ.data?.name}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>
            <Icon.GitCommit size={13} />
            {t("modal.savedAs")}
          </span>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Sparkles"
            onClick={submit}
            disabled={!form || create.isPending || !canCreateSkill(form)}
          >
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      {draftQ.isError ? (
        <ErrorState body={t("modal.loadError")} onRetry={() => draftQ.refetch()} />
      ) : !form ? (
        <div style={s.loading} aria-busy>
          <span style={s.loadingText}>{t("modal.loading")}</span>
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={200} />
        </div>
      ) : (
        <div style={s.body}>
          <div style={s.banner}>
            <Icon.Wrench size={15} style={s.bannerIcon} />
            <span>
              {t.rich("modal.banner", {
                count: acceptedCount,
                repo: repoName,
                b: (chunks) => <b style={s.bannerStrong}>{chunks}</b>,
                r: (chunks) => (
                  <span className="mono" style={s.repo}>
                    {chunks}
                  </span>
                ),
              })}
            </span>
          </div>

          <FormField label={t("modal.name")} hint={t("modal.nameHint")} required>
            <TextInput value={form.name} onChange={(v) => set("name", v.trim())} mono aria-label={t("modal.name")} />
          </FormField>
          <FormField label={t("modal.description")} hint={t("modal.descriptionHint")} required>
            <TextInput
              value={form.description}
              onChange={(v) => set("description", v)}
              aria-label={t("modal.description")}
            />
          </FormField>
          <div style={s.twoCol}>
            <FormField label={t("modal.type")}>
              <SelectInput
                value={form.type}
                onChange={(v) => set("type", v as SkillType)}
                options={SKILL_TYPES.map((ty) => ({ value: ty, label: tSkills(`type.${ty}`) }))}
              />
            </FormField>
            <FormField label={t("modal.enabled")} hint={t("modal.enabledHint")}>
              <div style={s.toggleRow}>
                <Toggle label={t("modal.enabled")} on={form.enabled} onChange={(v) => set("enabled", v)} />
              </div>
            </FormField>
          </div>
          <FormField label={t("modal.agent")} hint={t("modal.agentHint")}>
            <SelectInput
              value={form.agent_id ?? NO_AGENT}
              onChange={(v) => set("agent_id", v === NO_AGENT ? null : v)}
              options={agentOptions}
              mono={false}
            />
          </FormField>
          <FormField label={t("modal.body")} required>
            <div style={s.editor}>
              <div style={s.editorHead}>
                <Icon.FileText size={14} />
                <span className="mono" style={s.editorFile}>
                  {form.name || "skill"}.md
                </span>
                <span style={s.unsaved}>{t("modal.unsaved")}</span>
                <span style={s.tokens}>{t("modal.tokens", { count: approxTokens(form.body) })}</span>
              </div>
              <Textarea value={form.body} onChange={(v) => set("body", v)} rows={BODY_ROWS} mono />
            </div>
          </FormField>
          {error && (
            <div role="alert" style={s.error}>
              {error}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
