"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, Button } from "@devdigest/ui";
import { useSecretsStatus, useRepos } from "../../../../../../../lib/hooks";
import { SectionTitle } from "../SectionTitle";
import { s } from "./styles";

/**
 * Settings → GitHub Integration. Shows whether a GitHub PAT is configured, the
 * repos connected to this workspace (with their default branch), and a CTA back
 * to API Keys when the token is missing. Token entry/validation itself lives in
 * the API Keys panel.
 */
export function SettingsGitHub() {
  const t = useTranslations("settings");
  const { data: status } = useSecretsStatus();
  const { data: repos } = useRepos();
  const connected = status?.github ?? false;

  return (
    <div style={s.wrap}>
      <SectionTitle title={t("github.title")} body={t("github.body")} />

      <div style={s.statusCard}>
        <span style={s.dot(connected)} />
        <div style={s.statusText}>
          <div style={s.statusTitle}>
            {connected ? t("github.connected") : t("github.notConnected")}
          </div>
          <div style={s.statusSub}>
            {connected ? t("github.connectedSub") : t("github.notConnectedSub")}
          </div>
        </div>
        {!connected && (
          <Link href="/settings/api-keys">
            <Button kind="secondary" size="md" icon="Lock">
              {t("github.addToken")}
            </Button>
          </Link>
        )}
      </div>

      <div style={s.fieldLabel}>{t("github.connectedRepos", { count: repos?.length ?? 0 })}</div>
      {repos && repos.length > 0 ? (
        <div style={s.repoList}>
          {repos.map((r) => (
            <div key={r.id} style={s.repoItem}>
              <Icon.GitBranch size={14} />
              <span style={s.repoName}>{r.full_name}</span>
              <span style={s.repoBranch}>{r.default_branch}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={s.empty}>{t("github.noRepos")}</div>
      )}
    </div>
  );
}
