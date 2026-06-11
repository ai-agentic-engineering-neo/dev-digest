"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, Toggle } from "@devdigest/ui";
import { useSettings, useUpdateSettings } from "../../../../../../../lib/hooks";
import { SectionTitle } from "../SectionTitle";
import { s } from "./styles";

const POLLING_OPTIONS = ["1", "5", "15", "30"];

/**
 * Settings → Workspace. Surfaces the workspace-level prefs that already live in
 * the Settings contract (theme, density, polling interval, sync-to-folder) but
 * had no UI. All persist through the standard /settings key/value bag.
 */
export function SettingsWorkspace() {
  const t = useTranslations("settings");
  const { data: settings } = useSettings();
  const update = useUpdateSettings();

  const theme = settings?.theme ?? "dark";
  const density = settings?.density ?? "regular";
  const interval = settings?.polling_interval_min ?? 5;
  const sync = settings?.sync_to_folder ?? true;

  return (
    <div style={s.wrap}>
      <SectionTitle title={t("workspace.title")} body={t("workspace.body")} />

      <FormField label={t("workspace.theme")} hint={t("workspace.themeHint")}>
        <SelectInput
          value={theme}
          onChange={(v) => update.mutate({ theme: v as "dark" | "light" })}
          options={[
            { value: "dark", label: t("workspace.themeDark") },
            { value: "light", label: t("workspace.themeLight") },
          ]}
        />
      </FormField>

      <FormField label={t("workspace.density")} hint={t("workspace.densityHint")}>
        <SelectInput
          value={density}
          onChange={(v) => update.mutate({ density: v as "regular" | "compact" })}
          options={[
            { value: "regular", label: t("workspace.densityRegular") },
            { value: "compact", label: t("workspace.densityCompact") },
          ]}
        />
      </FormField>

      <FormField label={t("workspace.pollingInterval")} hint={t("workspace.pollingHint")}>
        <SelectInput
          value={String(interval)}
          onChange={(v) => update.mutate({ polling_interval_min: Number(v) })}
          options={POLLING_OPTIONS.map((v) => ({ value: v, label: t("workspace.everyMin", { n: v }) }))}
        />
      </FormField>

      <div style={s.toggleCard}>
        <Toggle on={sync} onChange={(v) => update.mutate({ sync_to_folder: v })} size={18} />
        <div>
          <div style={s.toggleTitle}>{t("workspace.syncTitle")}</div>
          <div style={s.toggleSub}>{sync ? t("workspace.syncOn") : t("workspace.syncOff")}</div>
        </div>
      </div>
    </div>
  );
}
