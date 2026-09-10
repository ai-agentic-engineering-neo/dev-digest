"use client";

import { useTranslations } from "next-intl";
import { s } from "./styles";

/**
 * Shown when the target repository already has DevDigest CI with OTHER
 * reviewers on it. Exporting there used to be refused ("one agent manifest
 * per repository"); it now joins that installation, so the wizard has to say
 * so before the user installs — the generated bundle carries every reviewer's
 * manifest, and the PR touches their files too.
 *
 * Renders nothing for a first install: an empty notice slot would push the
 * step's real content down for the common case.
 */
export function JoiningNotice({
  repo,
  agentName,
  existingAgents,
}: {
  repo: string;
  agentName: string;
  /** Names of reviewers already installed, excluding this agent
   *  (`CiPreview.existing_agents`). */
  existingAgents: string[] | undefined;
}) {
  const t = useTranslations("ci");
  if (!existingAgents || existingAgents.length === 0) return null;

  return (
    <div style={s.noticeBox} role="status">
      <strong>{t("exportWizard.joiningTitle")}</strong>
      <span style={s.hint}>
        {t("exportWizard.joiningBody", {
          repo,
          agentName,
          // Intl list formatting, not a hand-rolled join: the separator is a
          // locale concern, and this string is translated.
          agents: new Intl.ListFormat(undefined, { style: "long", type: "conjunction" }).format(
            existingAgents,
          ),
        })}
      </span>
    </div>
  );
}
