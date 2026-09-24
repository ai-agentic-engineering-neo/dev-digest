"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Textarea, Toggle, Button } from "@devdigest/ui";
import type { Agent, CiFailOn, Provider, ReviewStrategy } from "@devdigest/shared";
import { useUpdateAgent } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { ModelSelectField } from "@/app/agents/_components/ModelSelectField";
import { CI_FAIL_ON_VALUES, PROVIDER_OPTIONS, STRATEGY_VALUES } from "./constants";
import { s } from "./styles";

/** Fields the Config form edits (the PUT patch is a subset of these). */
type ConfigDraft = Partial<
  Pick<
    Agent,
    "name" | "description" | "provider" | "model" | "system_prompt" | "strategy" | "ci_fail_on" | "repo_intel" | "enabled"
  >
>;

/** Config tab — name/description/provider/model/system-prompt + enabled toggle.
 *  The draft holds only the fields the user touched; everything else reads the
 *  live `agent` (query cache), and Save sends only the draft — so a change made
 *  elsewhere (e.g. the AgentCard enabled toggle) is never reverted. The parent
 *  keys this component by agent id, which resets the draft on agent switch. */
export function ConfigTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const update = useUpdateAgent();
  const [draft, setDraft] = React.useState<ConfigDraft>({});
  const edit = <K extends keyof ConfigDraft>(key: K) => (value: Agent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const form = { ...agent, ...draft };
  const { name, description, provider, model, strategy, enabled } = form;
  const systemPrompt = form.system_prompt;
  const ciFailOn = form.ci_fail_on;
  const repoIntel = form.repo_intel;

  // Friendly labels for the strategy select (values come from constants).
  const strategyOptions = STRATEGY_VALUES.map((v) => ({ value: v, label: t(`config.strategyOptions.${v}`) }));
  const ciFailOnOptions = CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: t(`config.ciFailOnOptions.${v}`) }));

  const save = () =>
    update.mutate(
      { id: agent.id, patch: draft },
      {
        // Failures are surfaced by the global mutation error toast; confirm the
        // save with a success toast (not just the inline "Saved (vN)" note).
        // The saved agent lands in the query cache, so the draft can be dropped.
        onSuccess: (data) => {
          setDraft({});
          toast.success(t("config.savedToast", { version: data.version }));
        },
      },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={edit("enabled")} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={edit("name")} />
      </FormField>
      <FormField label={t("config.description")}>
        <TextInput value={description} onChange={edit("description")} />
      </FormField>
      <FormField label={t("config.provider")}>
        <SelectInput
          value={provider}
          onChange={(v) => edit("provider")(v as Provider)}
          options={[...PROVIDER_OPTIONS]}
        />
      </FormField>
      <ModelSelectField provider={provider} value={model} onChange={edit("model")} />
      <FormField label={t("config.strategy")} hint={t("config.strategyHint")}>
        <SelectInput
          value={strategy}
          onChange={(v) => edit("strategy")(v as ReviewStrategy)}
          options={strategyOptions}
        />
      </FormField>
      <FormField label={t("config.ciFailOn")} hint={t("config.ciFailOnHint")}>
        <SelectInput
          value={ciFailOn}
          onChange={(v) => edit("ci_fail_on")(v as CiFailOn)}
          options={ciFailOnOptions}
        />
      </FormField>
      <FormField label={t("config.repoIntel")} hint={t("config.repoIntelHint")}>
        <label style={s.enabledLabel}>
          <Toggle on={repoIntel} onChange={edit("repo_intel")} size={16} />
        </label>
      </FormField>
      <FormField label={t("config.systemPrompt")} hint={t("config.systemPromptHint")}>
        <Textarea value={systemPrompt} onChange={edit("system_prompt")} rows={8} mono />
      </FormField>
      <FormField label={t("config.outputSchema")}>
        <SelectInput value={t("config.outputSchemaOption")} options={[t("config.outputSchemaOption")]} />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending || Object.keys(draft).length === 0}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {update.isSuccess && (
          <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
