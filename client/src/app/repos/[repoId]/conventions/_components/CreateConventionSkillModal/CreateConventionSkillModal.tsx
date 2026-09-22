/* CreateConventionSkillModal — the accepted rules merged into one editable
   skill draft (name, description, type, enabled, agents, Markdown body) →
   POST /repos/:id/conventions/skill. Until the body is edited by hand it
   follows the name (its `# <name>` title); a duplicate name (409 conflict)
   is shown inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, FormField, Icon, Modal, Toggle } from "@devdigest/ui";
import type { Convention } from "@devdigest/shared";
import { SkillMetaFields, type SkillMetaValue } from "@/app/skills/_components/SkillMetaFields";
import { BodyEditor } from "@/app/skills/[id]/_components/SkillEditor/_components/BodyEditor";
import { isValidSkillName } from "@/app/skills/helpers";
import { useAgents, useCreateConventionSkill } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { buildSkillDraft, defaultSkillName } from "./helpers";
import { s } from "./styles";

export function CreateConventionSkillModal({
  repoId,
  repoName,
  conventions,
  onClose,
}: {
  repoId: string;
  repoName: string;
  /** The accepted rules merged into the skill, in display order. */
  conventions: readonly Convention[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const create = useCreateConventionSkill(repoId);
  const { data: agents } = useAgents();
  const [meta, setMeta] = React.useState<SkillMetaValue>(() => ({
    name: defaultSkillName(repoName),
    description: t("skillModal.defaultDescription", { count: conventions.length, repo: repoName }),
    type: "convention",
  }));
  const [enabled, setEnabled] = React.useState(true);
  const [agentIds, setAgentIds] = React.useState<ReadonlySet<string>>(new Set());
  // null = not edited by hand: the draft is derived from the name.
  const [editedBody, setEditedBody] = React.useState<string | null>(null);
  const body = editedBody ?? buildSkillDraft(meta.name, repoName, conventions);

  const conflict = create.error instanceof ApiError && create.error.code === "conflict";
  const valid = isValidSkillName(meta.name) && body.trim().length > 0;

  const setMetaField = <K extends keyof SkillMetaValue>(key: K, v: SkillMetaValue[K]) => {
    if (key === "name" && conflict) create.reset();
    setMeta((m) => ({ ...m, [key]: v }));
  };
  const toggleAgent = (id: string, on: boolean) =>
    setAgentIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const submit = () =>
    create.mutate(
      {
        convention_ids: conventions.map((c) => c.id),
        name: meta.name,
        description: meta.description.trim(),
        type: meta.type,
        body,
        enabled,
        agent_ids: [...agentIds],
      },
      {
        onSuccess: ({ skill, linked_agents }) => {
          toast.success(
            linked_agents.length > 0
              ? t("skillModal.createdLinked", { name: skill.name, count: linked_agents.length })
              : t("skillModal.created", { name: skill.name }),
          );
          onClose();
        },
      },
    );

  return (
    <Modal
      width={780}
      title={t("skillModal.title")}
      subtitle={<span className="mono">{meta.name || "…"}</span>}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>
            <Icon.GitCommit size={13} />
            {t.rich("skillModal.footer", { b: (chunks) => <b style={s.strong}>{chunks}</b> })}
          </span>
          <Button kind="ghost" onClick={onClose}>
            {t("skillModal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={!valid || create.isPending}>
            {create.isPending ? t("skillModal.creating") : t("skillModal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>
          <Icon.Wrench size={14} style={s.bannerIcon} />
          <span>
            {t.rich("skillModal.banner", {
              count: conventions.length,
              repo: repoName,
              b: (chunks) => <b style={s.strong}>{chunks}</b>,
              hl: (chunks) => <span style={s.repo}>{chunks}</span>,
            })}
          </span>
        </div>
        <SkillMetaFields value={meta} onChange={setMetaField} />
        {conflict && (
          <p role="alert" style={s.error}>
            {t("skillModal.conflict")}
          </p>
        )}
        <FormField label={t("skillModal.enabled")} hint={t("skillModal.enabledHint")}>
          <Toggle on={enabled} onChange={setEnabled} />
        </FormField>
        <FormField label={t("skillModal.agents")} hint={t("skillModal.agentsHint")}>
          {agents && agents.length === 0 && <span style={s.muted}>{t("skillModal.noAgents")}</span>}
          <div style={s.agents}>
            {agents?.map((a) => (
              <Checkbox
                key={a.id}
                checked={agentIds.has(a.id)}
                onChange={(on) => toggleAgent(a.id, on)}
                label={
                  <span>
                    {a.name}
                    {!a.enabled && <span style={s.muted}> · {t("skillModal.agentDisabled")}</span>}
                  </span>
                }
              />
            ))}
          </div>
        </FormField>
        <FormField label={t("skillModal.body")} required>
          <BodyEditor name={meta.name} value={body} onChange={setEditedBody} dirty />
        </FormField>
      </div>
    </Modal>
  );
}
