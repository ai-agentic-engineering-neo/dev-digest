"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { useSettings } from "../../../../../../../lib/hooks";
import { FEATURE_MODELS } from "../../../../../../../lib/feature-models";
import type { FeatureModelChoice, FeatureModelId } from "../../../../../../../lib/types";
import { SectionTitle } from "../SectionTitle";
import { s } from "./styles";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";

/**
 * Settings → About. App version + a read-only summary of which provider/model
 * each system feature currently resolves to (workspace override, else default).
 */
export function SettingsAbout() {
  const t = useTranslations("settings");
  const { data: settings } = useSettings();
  const chosen = (settings?.feature_models ?? {}) as Partial<Record<FeatureModelId, FeatureModelChoice>>;

  return (
    <div style={s.wrap}>
      <SectionTitle title={t("about.title")} body={t("about.body")} />

      <div style={s.versionRow}>
        <Icon.Boxes size={16} />
        <span style={s.versionLabel}>DevDigest</span>
        <span style={s.versionValue}>v{APP_VERSION}</span>
      </div>

      <div style={s.sectionLabel}>{t("about.modelsSummary")}</div>
      <div style={s.table}>
        {FEATURE_MODELS.map((f, i) => {
          const choice = chosen[f.id];
          const provider = choice?.provider ?? f.defaultProvider;
          const model = choice?.model ?? f.defaultModel;
          return (
            <div key={f.id} style={i === 0 ? s.rowFirst : s.row}>
              <span style={s.feature}>{f.label}</span>
              {!choice && <span style={s.defaultTag}>{t("about.default")}</span>}
              <span style={s.model}>
                {provider} · {model}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
