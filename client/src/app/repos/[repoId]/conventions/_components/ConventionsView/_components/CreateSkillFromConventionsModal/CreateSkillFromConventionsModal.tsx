"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  FormField,
  Icon,
  Modal,
  SelectInput,
  TextInput,
  Textarea,
  Toggle,
} from "@devdigest/ui";
import type { ConventionCandidate, SkillType } from "@devdigest/shared";
import { useAgents } from "@/lib/hooks/agents";
import { useComposeConventions } from "@/lib/hooks/conventions";
import { assembleSkillBody, approxTokens, defaultSkillName, repoDisplayName } from "../../helpers";
import { DEFAULT_TYPE, MODAL_WIDTH, TYPE_OPTIONS } from "./constants";
import { s } from "./styles";

export function CreateSkillFromConventionsModal({
  repoId,
  repoFullName,
  selected,
  onClose,
}: {
  repoId: string;
  repoFullName: string;
  selected: ConventionCandidate[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const compose = useComposeConventions(repoId);
  const { data: agents = [] } = useAgents();
  const accepted = selected.filter((c) => c.status === "accepted");
  const repoLabel = repoDisplayName(repoFullName, t("page.repoFallback"));
  const [name, setName] = React.useState(defaultSkillName(repoFullName, t("page.repoFallback")));
  const [description, setDescription] = React.useState(
    t("compose.defaultDescription", { count: accepted.length, repo: repoLabel }),
  );
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(() =>
    assembleSkillBody(defaultSkillName(repoFullName, t("page.repoFallback")), repoLabel, accepted),
  );
  const [agentId, setAgentId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (agentId !== null || agents.length === 0) return;
    setAgentId(agents[0]!.id);
  }, [agents, agentId]);

  const resolvedAgentId = agentId ?? "";

  const canSubmit =
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    body.trim().length > 0 &&
    !compose.isPending;

  const submit = async () => {
    if (!canSubmit) return;
    await compose.mutateAsync({
      convention_ids: accepted.map((c) => c.id),
      name: name.trim(),
      description: description.trim(),
      type,
      body: body.trim(),
      enabled,
      ...(resolvedAgentId ? { agent_id: resolvedAgentId } : {}),
    });
    onClose();
    router.push(resolvedAgentId ? `/agents/${resolvedAgentId}?tab=skills` : "/skills");
  };

  const typeOptions = TYPE_OPTIONS.map((v) => ({ value: v, label: t(`compose.types.${v}`) }));
  const agentOptions = [
    { value: "", label: t("compose.agentNone") },
    ...agents.map((a) => ({ value: a.id, label: a.name })),
  ];

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("compose.title")}
      subtitle={name || defaultSkillName(repoFullName, t("page.repoFallback"))}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("compose.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={!canSubmit}>
            {compose.isPending ? t("compose.creating") : t("compose.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>
          <Icon.Sparkles size={16} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} />
          <span>
            {t("compose.banner", { count: accepted.length, repo: repoLabel })}
          </span>
        </div>
        <FormField label={t("compose.fields.name")} required>
          <TextInput value={name} onChange={setName} />
        </FormField>
        <FormField label={t("compose.fields.description")} required>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("compose.fields.descriptionPlaceholder")}
          />
        </FormField>
        <div style={s.row}>
          <FormField label={t("compose.fields.type")} required>
            <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
          </FormField>
          <div style={s.enabled}>
            <label style={s.enabledLabel}>
              {t("compose.fields.enabled")}
              <Toggle on={enabled} onChange={setEnabled} size={16} />
            </label>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("compose.enabledHint")}</span>
          </div>
        </div>
        <FormField label={t("compose.agent")} hint={t("compose.agentHint")}>
          <SelectInput value={resolvedAgentId} onChange={setAgentId} options={agentOptions} mono={false} />
        </FormField>
        <FormField label={t("compose.fields.body")} required>
          <div style={s.bodyChrome}>
            <Icon.FileText size={14} />
            <span style={s.bodyName}>{name.trim() || "skill"}.md</span>
            <Badge color="var(--warn)">{t("compose.unsaved")}</Badge>
            <span style={s.tokens}>{t("compose.tokens", { count: approxTokens(body) })}</span>
          </div>
          <Textarea value={body} onChange={setBody} rows={10} mono />
        </FormField>
      </div>
    </Modal>
  );
}
