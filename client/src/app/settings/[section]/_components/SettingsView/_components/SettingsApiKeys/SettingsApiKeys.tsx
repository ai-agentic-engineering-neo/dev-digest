"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useSecretsStatus } from "../../../../../../../lib/hooks";
import { SectionTitle } from "../SectionTitle";
import { KEY_ROWS } from "./constants";
import { KeyRow } from "./atoms";
import { s } from "./styles";

export function SettingsApiKeys() {
  const t = useTranslations("settings");
  const { data: status } = useSecretsStatus();
  return (
    <div style={s.wrap}>
      <SectionTitle title={t("apiKeys.title")} body={t("apiKeys.body")} />
      {KEY_ROWS.map((row) => (
        <KeyRow
          key={row.provider}
          label={t(row.labelKey)}
          provider={row.provider}
          hint={t(row.hintKey)}
          configured={status?.[row.provider]}
        />
      ))}
    </div>
  );
}
