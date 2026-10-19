"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, SearchableSelect, Textarea, Toggle, Button, Icon } from "@devdigest/ui";
import type { Agent, CiFailOn, Provider, ReviewStrategy } from "@devdigest/shared";
import { useUpdateAgent, useProviderModels, useDeleteAgent } from "../../../../../../../lib/hooks/agents";
import { useRouter } from "next/navigation";
import { useToast } from "../../../../../../../lib/toast";
import { toModelOptions } from "../../../../../../../lib/model-label";
import {
  CI_FAIL_ON_VALUES,
  OUTPUT_SCHEMA_VALUE,
  PROVIDER_OPTIONS,
  STRATEGY_VALUES,
  SYSTEM_PROMPT_TOKEN_BUDGET,
} from "./constants";
import { approxTokens } from "./helpers";
import { s } from "./styles";

/** Config tab — name/description/model/system prompt/output schema (mockup order),
    plus an "Advanced" section: provider, review strategy, CI gate, repo intel, delete. */
export function ConfigTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const update = useUpdateAgent();
  const [name, setName] = React.useState(agent.name);
  const [description, setDescription] = React.useState(agent.description);
  const [provider, setProvider] = React.useState<Provider>(agent.provider);
  const [model, setModel] = React.useState(agent.model);
  const [systemPrompt, setSystemPrompt] = React.useState(agent.system_prompt);
  const [strategy, setStrategy] = React.useState<ReviewStrategy>(agent.strategy);
  const [ciFailOn, setCiFailOn] = React.useState<CiFailOn>(agent.ci_fail_on);
  const [repoIntel, setRepoIntel] = React.useState(agent.repo_intel);
  const [enabled, setEnabled] = React.useState(agent.enabled);

  const [advanced, setAdvanced] = React.useState(false);
  const router = useRouter();
  const del = useDeleteAgent();

  // Reset the local form to the saved agent (on agent switch and on Cancel).
  const reset = () => {
    setName(agent.name);
    setDescription(agent.description);
    setProvider(agent.provider);
    setModel(agent.model);
    setSystemPrompt(agent.system_prompt);
    setStrategy(agent.strategy);
    setCiFailOn(agent.ci_fail_on);
    setRepoIntel(agent.repo_intel);
    setEnabled(agent.enabled);
  };
  React.useEffect(reset, [agent.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = () => {
    if (!window.confirm(t("config.deleteConfirm", { name: agent.name }))) return;
    del.mutate(agent.id, { onSuccess: () => router.push("/agents") });
  };
  const promptTokens = approxTokens(systemPrompt);

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
        patch: {
          name,
          description,
          provider,
          model,
          system_prompt: systemPrompt,
          strategy,
          ci_fail_on: ciFailOn,
          repo_intel: repoIntel,
          enabled,
        },
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
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={setName} aria-label={t("config.name")} />
      </FormField>
      <FormField label={t("config.description")}>
        <TextInput value={description} onChange={setDescription} aria-label={t("config.description")} />
      </FormField>
      <FormField
        label={t("config.model")}
        hint={noModels ? t("config.modelEmptyHint", { provider }) : t("config.modelHint")}
      >
        <SearchableSelect
          value={model}
          onChange={setModel}
          options={modelOptions}
          placeholder={t("config.modelSearch")}
        />
      </FormField>
      <FormField
        label={t("config.systemPrompt")}
        hint={t("config.systemPromptHint")}
        right={
          <span className="mono" style={s.tokens(promptTokens > SYSTEM_PROMPT_TOKEN_BUDGET)}>
            {t("config.promptTokens", {
              count: promptTokens.toLocaleString("en-US"),
              budget: SYSTEM_PROMPT_TOKEN_BUDGET.toLocaleString("en-US"),
            })}
          </span>
        }
      >
        <Textarea value={systemPrompt} onChange={setSystemPrompt} rows={10} mono />
      </FormField>
      <FormField label={t("config.outputSchema")}>
        <SelectInput value={OUTPUT_SCHEMA_VALUE} options={[OUTPUT_SCHEMA_VALUE]} />
      </FormField>

      <button type="button" aria-expanded={advanced} onClick={() => setAdvanced((v) => !v)} style={s.advancedToggle}>
        {advanced ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
        {t("config.advanced")}
      </button>
      {advanced && (
        <div style={s.advanced}>
          <FormField label={t("config.provider")}>
            <SelectInput
              value={provider}
              onChange={(v) => setProvider(v as Provider)}
              options={[...PROVIDER_OPTIONS]}
            />
          </FormField>
          <FormField label={t("config.strategy")} hint={t("config.strategyHint")}>
            <SelectInput
              value={strategy}
              onChange={(v) => setStrategy(v as ReviewStrategy)}
              options={strategyOptions}
            />
          </FormField>
          <FormField label={t("config.ciFailOn")} hint={t("config.ciFailOnHint")}>
            <SelectInput
              value={ciFailOn}
              onChange={(v) => setCiFailOn(v as CiFailOn)}
              options={ciFailOnOptions}
            />
          </FormField>
          <FormField label={t("config.repoIntel")} hint={t("config.repoIntelHint")}>
            <Toggle on={repoIntel} onChange={setRepoIntel} size={16} />
          </FormField>
          <FormField label={t("config.dangerZone")} hint={t("config.deleteHint")}>
            <Button kind="danger" size="sm" icon="Trash" onClick={remove} loading={del.isPending}>
              {t("config.delete")}
            </Button>
          </FormField>
        </div>
      )}

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        <Button kind="secondary" onClick={reset} disabled={update.isPending}>
          {t("config.cancel")}
        </Button>
        {update.isSuccess && (
          <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
