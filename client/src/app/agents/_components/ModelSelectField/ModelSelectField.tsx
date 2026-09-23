/* ModelSelectField — searchable model picker for an agent's provider, loaded
   live from GET /providers/:provider/models. Used by the agent editor's Config
   tab and the create-agent modal. */
"use client";

import { useTranslations } from "next-intl";
import { FormField, SearchableSelect } from "@devdigest/ui";
import type { Provider } from "@devdigest/shared";
import { useProviderModels } from "@/lib/hooks";
import { toModelOptions } from "@/lib/model-label";

export function ModelSelectField({
  provider,
  value,
  onChange,
}: {
  provider: Provider;
  value: string;
  onChange: (model: string) => void;
}) {
  const t = useTranslations("agents");
  const { data: models } = useProviderModels(provider);
  // Show the price (USD per 1M in/out tokens) in the label when the provider
  // exposes it (OpenRouter) so a cheap model is easy to pick; value stays the id.
  const options = toModelOptions(models);
  // Keep a saved model that the provider no longer lists selectable.
  const listed = options.some((o) => (typeof o === "string" ? o : o.value) === value);
  if (value && !listed) options.unshift(value);
  // Empty list after load = provider key missing/invalid (listModels failed) —
  // guide the user instead of showing a silent one-item dropdown.
  const noModels = models !== undefined && models.length === 0;

  return (
    <FormField
      label={t("config.model")}
      hint={noModels ? t("config.modelEmptyHint", { provider }) : t("config.modelHint")}
    >
      <SearchableSelect value={value} onChange={onChange} options={options} placeholder={t("config.modelSearch")} />
    </FormField>
  );
}
