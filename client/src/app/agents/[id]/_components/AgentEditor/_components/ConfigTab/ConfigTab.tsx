"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, SearchableSelect, Textarea, Toggle, Button } from "@devdigest/ui";
import type { Agent, CiFailOn, Provider, ReviewStrategy } from "@devdigest/shared";
import { useUpdateAgent, useProviderModels } from "@/lib/hooks/agents";
import { useToast } from "@/lib/toast";
import { toModelOptions } from "@/lib/model-label";
import { CI_FAIL_ON_VALUES, OUTPUT_SCHEMA_VALUE, PROVIDER_OPTIONS, STRATEGY_VALUES } from "./constants";
import { formFromAgent, formToPatch, type AgentConfigForm } from "./helpers";
import { s } from "./styles";

/** Config tab — name/description/provider/model/system-prompt + enabled toggle. */
export function ConfigTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const update = useUpdateAgent();
  // One form object. It resets when the agent changes because the parent
  // renders <ConfigTab key={agent.id} /> (React remounts) — no sync effect.
  const [form, setForm] = React.useState(() => formFromAgent(agent));
  const setField =
    <K extends keyof AgentConfigForm>(field: K) =>
    (value: AgentConfigForm[K]) =>
      setForm((prev) => ({ ...prev, [field]: value }));
  const { name, description, provider, model, systemPrompt, strategy, ciFailOn, repoIntel, enabled } = form;

  const { data: models } = useProviderModels(provider);
  // Show the price (USD per 1M in/out tokens) in the label when the provider
  // exposes it (OpenRouter) so a cheap model is easy to pick; value stays the id.
  const modelOptions = toModelOptions(models);
  const hasModel = modelOptions.some((o) => (typeof o === "string" ? o : o.value) === model);
  if (!hasModel) modelOptions.unshift(model);
  // Empty list after load = provider key missing/invalid (listModels failed) —
  // guide the user instead of showing a silent one-item dropdown.
  const noModels = models !== undefined && models.length === 0;

  // Friendly labels for the strategy select (values come from constants).
  const strategyOptions = STRATEGY_VALUES.map((v) => ({ value: v, label: t(`config.strategyOptions.${v}`) }));
  const ciFailOnOptions = CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: t(`config.ciFailOnOptions.${v}`) }));

  const save = () =>
    update.mutate(
      {
        id: agent.id,
        patch: formToPatch(form),
      },
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
          <Toggle on={enabled} onChange={setField("enabled")} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={setField("name")} />
      </FormField>
      <FormField label={t("config.description")}>
        <TextInput value={description} onChange={setField("description")} />
      </FormField>
      <FormField label={t("config.provider")}>
        <SelectInput
          value={provider}
          onChange={(v) => setField("provider")(v as Provider)}
          options={[...PROVIDER_OPTIONS]}
        />
      </FormField>
      <FormField
        label={t("config.model")}
        hint={noModels ? t("config.modelEmptyHint", { provider }) : t("config.modelHint")}
      >
        <SearchableSelect
          value={model}
          onChange={setField("model")}
          options={modelOptions}
          placeholder={t("config.modelSearch")}
        />
      </FormField>
      <FormField label={t("config.strategy")} hint={t("config.strategyHint")}>
        <SelectInput
          value={strategy}
          onChange={(v) => setField("strategy")(v as ReviewStrategy)}
          options={strategyOptions}
        />
      </FormField>
      <FormField label={t("config.ciFailOn")} hint={t("config.ciFailOnHint")}>
        <SelectInput
          value={ciFailOn}
          onChange={(v) => setField("ciFailOn")(v as CiFailOn)}
          options={ciFailOnOptions}
        />
      </FormField>
      <FormField label={t("config.repoIntel")} hint={t("config.repoIntelHint")}>
        <label style={s.enabledLabel}>
          <Toggle on={repoIntel} onChange={setField("repoIntel")} size={16} />
        </label>
      </FormField>
      <FormField label={t("config.systemPrompt")} hint={t("config.systemPromptHint")}>
        <Textarea value={systemPrompt} onChange={setField("systemPrompt")} rows={8} mono />
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
