/* List view of the Blast Radius card: changed symbols → callers (runtime /
   type-only badge) → endpoints/crons, plus entry points and affected tests. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { symbolDisplayName } from "@/components/graph-canvas";
import { Card, Badge, MonoLink } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import type { BlastRadiusResponse } from "@/lib/hooks/blast-radius";
import { deletedSymbolNames } from "./helpers";
import { s } from "./styles";

interface BlastListProps {
  envelope: BlastRadiusResponse;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function BlastList({ envelope, repoFullName, headSha }: BlastListProps) {
  const t = useTranslations("impactGraph");
  const tCanvas = useTranslations("graph");
  const { data: blast, graph } = envelope;
  const deleted = deletedSymbolNames(envelope);
  const entryPoints = graph?.entryPoints;
  const tests = graph?.tests;

  return (
    <div style={s.groupList}>
      {blast.downstream.map((group) => (
        <Card key={group.symbol} style={s.groupCard}>
          <div style={s.groupHeader}>
            <span
              className="mono"
              style={{ ...s.groupSymbol, textDecoration: deleted.has(group.symbol) ? "line-through" : undefined }}
            >
              {symbolDisplayName(group.symbol, tCanvas("moduleScope"))}
            </span>
            {deleted.has(group.symbol) && <Badge color="var(--danger)">{t("list.deleted")}</Badge>}
            <Badge color="var(--text-secondary)">{t("stat.callers", { count: group.callers.length })}</Badge>
          </div>

          <ul style={s.callerList}>
            {group.callers.map((c, i) => (
              <li key={`${c.file}:${c.line}:${i}`} style={s.callerRow}>
                <span style={s.callerLinkWrap} title={`${c.file}:${c.line}`}>
                  <MonoLink
                    href={
                      repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, c.file, c.line, c.line) : undefined
                    }
                  >
                    {c.file}:{c.line}
                  </MonoLink>
                </span>
                <Badge color="var(--text-secondary)">{c.type_only ? t("list.typeOnly") : t("list.runtime")}</Badge>
                <span style={s.callerSymbol}>{symbolDisplayName(c.name, tCanvas("moduleScope"))}</span>
              </li>
            ))}
          </ul>

          {(group.endpoints_affected.length > 0 || group.crons_affected.length > 0) && (
            <div style={s.factsRow}>
              {group.endpoints_affected.map((e) => (
                <Badge key={e} icon="Globe" color="var(--accent-text)" bg="var(--accent-bg)">
                  {e}
                </Badge>
              ))}
              {group.crons_affected.map((cron) => (
                <Badge key={cron} icon="Clock" color="var(--text-secondary)">
                  {cron}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      ))}

      {entryPoints && entryPoints.items.length > 0 && (
        <Card style={s.groupCard}>
          <div style={s.groupHeader}>
            <span style={s.groupSymbol}>{t("list.entryPoints")}</span>
            <Badge color="var(--text-secondary)">{entryPoints.total}</Badge>
          </div>
          <ul style={s.callerList}>
            {entryPoints.items.map((e) => (
              <li key={`${e.path}:${e.label}`} style={s.callerRow}>
                <span style={s.callerLinkWrap} title={e.path}>
                  <MonoLink
                    href={repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, e.path) : undefined}
                  >
                    {e.path}
                  </MonoLink>
                </span>
                <Badge icon="Globe" color="var(--accent-text)" bg="var(--accent-bg)">
                  {e.label}
                </Badge>
                <span style={s.callerSymbol}>{t("list.depth", { depth: e.depth })}</span>
              </li>
            ))}
          </ul>
          {entryPoints.total > entryPoints.items.length && (
            <span style={s.callerSymbol}>{t("list.more", { count: entryPoints.total - entryPoints.items.length })}</span>
          )}
        </Card>
      )}

      {tests && tests.items.length > 0 && (
        <Card style={s.groupCard}>
          <div style={s.groupHeader}>
            <span style={s.groupSymbol}>{t("list.tests")}</span>
            <Badge color="var(--text-secondary)">{tests.total}</Badge>
          </div>
          <ul style={s.callerList}>
            {tests.items.map((x) => (
              <li key={x.path} style={s.callerRow}>
                <span style={s.callerLinkWrap} title={x.path}>
                  <MonoLink href={repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, x.path) : undefined}>
                    {x.path}
                  </MonoLink>
                </span>
                <span style={s.callerSymbol}>{t("list.depth", { depth: x.depth })}</span>
              </li>
            ))}
          </ul>
          {tests.total > tests.items.length && (
            <span style={s.callerSymbol}>{t("list.more", { count: tests.total - tests.items.length })}</span>
          )}
        </Card>
      )}
    </div>
  );
}
