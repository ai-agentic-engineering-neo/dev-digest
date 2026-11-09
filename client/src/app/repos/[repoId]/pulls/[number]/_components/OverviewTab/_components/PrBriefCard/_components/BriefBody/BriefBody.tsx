"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Skeleton } from "@devdigest/ui";
import type { PrBriefResponse } from "@/lib/types";
import { generateErrorView, shortSha } from "../../helpers";
import { BriefMeta } from "../BriefMeta";
import { BriefNotes } from "../BriefNotes";
import { s } from "./styles";

interface BriefBodyProps {
  data: PrBriefResponse | undefined;
  loadError: boolean;
  /** mutation pending OR data.generating, computed by the caller */
  generating: boolean;
  generateError: unknown;
  onGenerate: () => void;
  onRetryLoad: () => void;
}

/** Everything the brief card shows under its title: action, states, summary, notes and meta. */
export function BriefBody({ data, loadError, generating, generateError, onGenerate, onRetryLoad }: BriefBodyProps) {
  const t = useTranslations("brief");
  const brief = data?.brief ?? null;
  const noFiles = data != null && data.changed_files === 0;
  const errorView = generateErrorView(generateError);

  return (
    <div style={s.root}>
      <div style={s.header}>
        {data && <span style={s.model}>{t("card.model", { model: data.model.model })}</span>}
        <div style={s.actions}>
          <Button kind="primary" size="sm" onClick={onGenerate} disabled={!data || generating || noFiles}>
            {brief ? t("actions.regenerate") : t("actions.generate")}
          </Button>
          {noFiles && <p style={s.hint}>{t("noFiles")}</p>}
        </div>
      </div>

      {generating && (
        <div role="status" aria-live="polite" style={s.status}>
          {t("actions.generating")}
        </div>
      )}

      {errorView && (
        <div role="alert" style={s.error}>
          {errorView.kind === "not_configured" && (
            <>
              <span>{t("errors.notConfigured")}</span>
              <Link href="/settings/api-keys" style={s.link}>
                {t("errors.openSettings")}
              </Link>
            </>
          )}
          {errorView.kind === "too_large" && (
            <span>{t("errors.tooLarge", { tokens: errorView.tokens, limit: errorView.limit })}</span>
          )}
          {errorView.kind === "no_files" && <span>{t("noFiles")}</span>}
          {errorView.kind === "failed" && (
            <>
              <span>{t("errors.failed", { reason: t(`errors.reason.${errorView.reason}`) })}</span>
              <Button kind="ghost" size="sm" onClick={onGenerate} disabled={generating}>
                {t("actions.retry")}
              </Button>
            </>
          )}
          {errorView.kind === "unknown" && (
            <>
              <span>{t("errors.unknown", { message: errorView.message })}</span>
              <Button kind="ghost" size="sm" onClick={onGenerate} disabled={generating}>
                {t("actions.retry")}
              </Button>
            </>
          )}
        </div>
      )}

      {loadError ? (
        <div role="alert" style={s.error}>
          <span>{t("card.loadError")}</span>
          <Button kind="ghost" size="sm" onClick={onRetryLoad}>
            {t("actions.retry")}
          </Button>
        </div>
      ) : brief ? (
        <>
          {data?.outdated && <p style={s.outdated}>{t("outdated", { sha: shortSha(brief.head_sha) })}</p>}
          <p style={s.label}>{t("card.summary")}</p>
          <p style={s.summary}>{brief.summary}</p>
          <BriefNotes missing={brief.missing_inputs} truncated={brief.truncated} />
          <BriefMeta brief={brief} />
        </>
      ) : generating || !data ? (
        <Skeleton height={60} />
      ) : (
        <>
          <p style={s.empty}>{t("unavailable")}</p>
          <p style={s.emptyHint}>{t("unavailableHint")}</p>
        </>
      )}
    </div>
  );
}
