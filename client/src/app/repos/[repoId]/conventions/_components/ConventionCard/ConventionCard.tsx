/* ConventionCard — one extracted house-rule: category, rule, the verified
   evidence line (link + snippet), confidence, and its review actions. Accept
   only marks it for the skill; "Edit first" opens the inline editor. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, MonoLink, ProgressBar } from "@devdigest/ui";
import type { ConventionCandidate, Repo } from "@devdigest/shared";
import { useUpdateConvention } from "@/lib/hooks/conventions";
import { ConventionEditor } from "../ConventionEditor";
import { confidenceColor, evidenceHref, evidenceLabel } from "./helpers";
import { s } from "./styles";

export function ConventionCard({
  repoId,
  repo,
  convention: c,
  disabled,
}: {
  repoId: string;
  repo: Repo | null;
  convention: ConventionCandidate;
  disabled?: boolean;
}) {
  const t = useTranslations("conventions");
  const update = useUpdateConvention(repoId);
  const [editing, setEditing] = React.useState(false);
  const pct = Math.round(c.confidence * 100);
  const busy = disabled || update.isPending;
  const setStatus = (status: ConventionCandidate["status"]) => update.mutate({ id: c.id, patch: { status } });

  return (
    <article style={s.card(c.status === "rejected")} aria-label={c.rule}>
      <div style={s.main}>
        <div style={s.head}>
          <Badge>{t(`categories.${c.category}`)}</Badge>
          {c.status === "accepted" && (
            <Badge color="var(--ok)" icon="Check">
              {t("card.accepted")}
            </Badge>
          )}
          {c.status === "rejected" && <Badge color="var(--text-muted)">{t("card.rejected")}</Badge>}
        </div>

        {editing ? (
          <ConventionEditor
            key={c.id}
            convention={c}
            saving={update.isPending}
            onCancel={() => setEditing(false)}
            onSave={(patch) =>
              update.mutate({ id: c.id, patch: { ...patch, status: "accepted" } }, { onSuccess: () => setEditing(false) })
            }
          />
        ) : (
          <>
            <div style={s.rule}>{c.rule}</div>
            <div style={s.evidence}>
              <div style={s.evidenceHead}>
                <MonoLink href={evidenceHref(repo, c)}>{evidenceLabel(c)}</MonoLink>
              </div>
              {c.evidence_snippet && (
                <pre className="mono" style={s.snippet}>
                  {c.evidence_snippet}
                </pre>
              )}
            </div>
            <div style={s.confidence}>
              <span style={s.confidenceLabel}>{t("card.confidence")}</span>
              <div style={s.bar}>
                <ProgressBar value={pct} color={confidenceColor(pct)} height={6} />
              </div>
              <span className="mono tnum" style={s.pct}>
                {pct}%
              </span>
            </div>
          </>
        )}
      </div>

      {!editing && (
        <div style={s.actions}>
          {c.status === "pending" ? (
            <>
              <Button size="sm" kind="primary" icon="Check" onClick={() => setStatus("accepted")} disabled={busy}>
                {t("card.acceptAsSkill")}
              </Button>
              <Button size="sm" icon="Edit" onClick={() => setEditing(true)} disabled={busy}>
                {t("card.editFirst")}
              </Button>
              <Button size="sm" kind="ghost" icon="X" onClick={() => setStatus("rejected")} disabled={busy}>
                {t("card.reject")}
              </Button>
            </>
          ) : (
            <>
              {c.status === "accepted" && (
                <Button size="sm" icon="Edit" onClick={() => setEditing(true)} disabled={busy}>
                  {t("card.edit")}
                </Button>
              )}
              <Button size="sm" kind="ghost" onClick={() => setStatus("pending")} disabled={busy}>
                {t("card.undo")}
              </Button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
