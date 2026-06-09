/* AgentCiTab — Agent Editor "CI" tab. One-click "Publish to CI": the target is
   always GitHub Actions, the repo is the active workspace repo, and the agent
   config (incl. ci_fail_on gate) lives in the agent — so there's nothing to
   configure here. Publishing opens/updates a PR adding the workflow + .devdigest/. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, MonoLink } from "@devdigest/ui";
import { useCiInstallations } from "../../../../../lib/hooks/ci";
import { useActiveRepo } from "../../../../../lib/repo-context";
import { PublishDialog } from "./PublishDialog";
import { s } from "./styles";

export function AgentCiTab({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName?: string;
}) {
  const t = useTranslations("ci");
  const { data: installs } = useCiInstallations();
  const { activeRepo } = useActiveRepo();
  const [open, setOpen] = React.useState(false);
  const mine = (installs ?? []).filter((i) => i.agent_id === agentId);
  const published = mine.length > 0;

  return (
    <div>
      {open && activeRepo && (
        <PublishDialog
          agentId={agentId}
          agentName={agentName}
          repo={activeRepo.full_name}
          base={activeRepo.default_branch}
          onClose={() => setOpen(false)}
        />
      )}

      <div style={s.header}>
        <div>
          <h3 style={s.heading}>{t("ciTab.heading")}</h3>
          <p style={s.subtitle}>{t("ciTab.subtitle")}</p>
        </div>
        <div style={s.actions}>
          <Button
            kind="primary"
            size="sm"
            icon="GitPullRequest"
            disabled={!activeRepo}
            onClick={() => setOpen(true)}
          >
            {published ? t("ciTab.update") : t("ciTab.publish")}
          </Button>
        </div>
      </div>

      {!activeRepo ? (
        <div style={s.empty}>{t("ciTab.noRepo")}</div>
      ) : mine.length === 0 ? (
        <div style={s.empty}>{t("ciTab.empty")}</div>
      ) : (
        <div style={s.list}>
          {mine.map((i) => (
            <div key={i.id} style={s.installRow}>
              <Icon.Workflow size={16} style={s.installIcon} />
              <div style={s.installBody}>
                <MonoLink>{i.repo}</MonoLink>
                <div style={s.installedAt}>
                  {t("ciTab.installed", { date: new Date(i.installed_at).toLocaleDateString() })}
                </div>
              </div>
              <Badge color="var(--text-secondary)" icon="Workflow">
                {i.target_type}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AgentCiTab;
