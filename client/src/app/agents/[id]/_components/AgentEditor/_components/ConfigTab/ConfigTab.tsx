"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, SearchableSelect, Textarea, Toggle, Button } from "@devdigest/ui";
import type { Agent, Provider, UpdateAgentInput } from "@devdigest/shared";
import { useUpdateAgent, useProviderModels } from "../../../../../../../lib/api/agents";
import { useToast } from "../../../../../../../lib/toast";
import { toModelOptions } from "../../../../../../../lib/model-label";
import { CI_FAIL_ON_VALUES, OUTPUT_SCHEMA_VALUE, PROVIDER_OPTIONS, STRATEGY_VALUES } from "./constants";
import { s } from "./styles";

/** Draft shape mirrors the PUT /agents/:id payload (minus output_schema, which
    the UI doesn't edit yet) so `save` can send it as-is. */
type Draft = Omit<Required<UpdateAgentInput>, "output_schema">;

function toDraft(agent: Agent): Draft {
  return {
    name: agent.name,
    description: agent.description,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.system_prompt,
    strategy: agent.strategy,
    ci_fail_on: agent.ci_fail_on,
    repo_intel: agent.repo_intel,
    enabled: agent.enabled,
  };
}

/** Config tab — name/description/provider/model/system-prompt + enabled toggle.
    Parent remounts this via `key={agent.id}` on agent switch, so the draft
    only ever needs to be initialized once per mount — no reset effect. */
export function ConfigTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const update = useUpdateAgent();
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(agent));
  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const { data: models } = useProviderModels(draft.provider);
  // Show the price (USD per 1M in/out tokens) in the label when the provider
  // exposes it (OpenRouter) so a cheap model is easy to pick; value stays the id.
  const modelOptions = toModelOptions(models);
  const hasModel = modelOptions.some((o) => (typeof o === "string" ? o : o.value) === draft.model);
  if (!hasModel) modelOptions.unshift(draft.model);
  // Empty list after load = provider key missing/invalid (listModels failed) —
  // guide the user instead of showing a silent one-item dropdown.
  const noModels = models !== undefined && models.length === 0;

  // Friendly labels for the strategy select (values come from constants).
  const strategyOptions = STRATEGY_VALUES.map((v) => ({ value: v, label: t(`config.strategyOptions.${v}`) }));
  const ciFailOnOptions = CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: t(`config.ciFailOnOptions.${v}`) }));

  const save = () =>
    update.mutate(
      { id: agent.id, patch: draft },
      {
        // Failures are surfaced by the global mutation error toast; confirm the
        // save with a success toast (not just the inline "Saved (vN)" note).
        onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })),
      },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={draft.enabled} onChange={(v) => patch("enabled", v)} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={draft.name} onChange={(v) => patch("name", v)} />
      </FormField>
      <FormField label={t("config.description")}>
        <TextInput value={draft.description} onChange={(v) => patch("description", v)} />
      </FormField>
      <FormField label={t("config.provider")}>
        <SelectInput
          value={draft.provider}
          onChange={(v) => patch("provider", v as Provider)}
          options={[...PROVIDER_OPTIONS]}
        />
      </FormField>
      <FormField
        label={t("config.model")}
        hint={noModels ? t("config.modelEmptyHint", { provider: draft.provider }) : t("config.modelHint")}
      >
        <SearchableSelect
          value={draft.model}
          onChange={(v) => patch("model", v)}
          options={modelOptions}
          placeholder={t("config.modelSearch")}
        />
      </FormField>
      <FormField label={t("config.strategy")} hint={t("config.strategyHint")}>
        <SelectInput
          value={draft.strategy}
          onChange={(v) => patch("strategy", v as Draft["strategy"])}
          options={strategyOptions}
        />
      </FormField>
      <FormField label={t("config.ciFailOn")} hint={t("config.ciFailOnHint")}>
        <SelectInput
          value={draft.ci_fail_on}
          onChange={(v) => patch("ci_fail_on", v as Draft["ci_fail_on"])}
          options={ciFailOnOptions}
        />
      </FormField>
      <FormField label={t("config.repoIntel")} hint={t("config.repoIntelHint")}>
        <label style={s.enabledLabel}>
          <Toggle on={draft.repo_intel} onChange={(v) => patch("repo_intel", v)} size={16} />
        </label>
      </FormField>
      <FormField label={t("config.systemPrompt")} hint={t("config.systemPromptHint")}>
        <Textarea value={draft.system_prompt} onChange={(v) => patch("system_prompt", v)} rows={8} mono />
      </FormField>
      <FormField label={t("config.outputSchema")}>
        <SelectInput value={OUTPUT_SCHEMA_VALUE} options={[OUTPUT_SCHEMA_VALUE]} />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {update.isSuccess && (
          <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
