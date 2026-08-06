/* BlastRadiusCard — specs/07-blast-radius.md. Own section on the Overview
   tab, next to IntentCard (not a separate top-level tab — see the L04 design
   mockup this was corrected against). Changed symbols → their resolved
   cross-file callers → impacted HTTP endpoints/crons, read entirely off
   repo-intel's persistent index (no LLM call). `file:line` links open the
   exact GitHub line in a new tab — same pattern as FindingCard.tsx.
   No in-app scroll target for callers (deliberately, per spec: this data has
   nowhere to scroll TO within this tab). */
"use client";

import React from "react";
import { SectionLabel, Card, Badge, MonoLink, EmptyState, Skeleton, Icon } from "@devdigest/ui";
import { useBlastRadius } from "@/lib/hooks/blast-radius";
import { githubBlobUrl } from "@/lib/github-urls";
import { STATUS_BANNER } from "./constants";
import { s } from "./styles";

interface BlastRadiusCardProps {
  prId: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function BlastRadiusCard({ prId, repoFullName, headSha }: BlastRadiusCardProps) {
  const { data: envelope, isLoading } = useBlastRadius(prId);

  if (isLoading || !envelope) {
    return (
      <section>
        <SectionLabel icon="Target">Blast Radius</SectionLabel>
        <div style={s.loadingStack}>
          <Skeleton height={64} />
          <Skeleton height={64} />
        </div>
      </section>
    );
  }

  const { status, degradedReason, data: blast } = envelope;
  const bannerCopy = STATUS_BANNER[status];

  const callerCount = blast.downstream.reduce((n, g) => n + g.callers.length, 0);
  const endpointCount = new Set(blast.downstream.flatMap((g) => g.endpoints_affected)).size;
  const cronCount = new Set(blast.downstream.flatMap((g) => g.crons_affected)).size;

  return (
    <section>
      <SectionLabel icon="Target">Blast Radius</SectionLabel>

      {blast.changed_symbols.length > 0 && (
        <div style={s.statsRow}>
          <Badge icon="Code">
            {blast.changed_symbols.length} symbol{blast.changed_symbols.length === 1 ? "" : "s"}
          </Badge>
          <Badge icon="CornerDownRight">
            {callerCount} caller{callerCount === 1 ? "" : "s"}
          </Badge>
          {endpointCount > 0 && (
            <Badge icon="Globe">
              {endpointCount} endpoint{endpointCount === 1 ? "" : "s"}
            </Badge>
          )}
          {cronCount > 0 && (
            <Badge icon="Clock">
              {cronCount} cron{cronCount === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
      )}

      {bannerCopy && (
        <div style={s.banner} role="status">
          <Icon.AlertTriangle size={13} style={{ color: "var(--warn)", flexShrink: 0 }} />
          <span>
            {bannerCopy}
            {degradedReason ? ` (${degradedReason})` : ""}
          </span>
        </div>
      )}

      {blast.changed_symbols.length === 0 ? (
        <EmptyState
          icon="Target"
          title="No blast radius to show"
          body="None of the changed files declare a function, method, or class this repo's index tracks."
        />
      ) : blast.downstream.length === 0 ? (
        <div style={s.noCallers}>
          {blast.changed_symbols.length} changed symbol(s) — no cross-file callers found in the index.
        </div>
      ) : (
        <div style={s.groupList}>
          {blast.downstream.map((group) => (
            <Card key={group.symbol} style={s.groupCard}>
              <div style={s.groupHeader}>
                <span className="mono" style={s.groupSymbol}>
                  {group.symbol}
                </span>
                <Badge color="var(--text-secondary)">
                  {group.callers.length} caller{group.callers.length === 1 ? "" : "s"}
                </Badge>
              </div>

              <ul style={s.callerList}>
                {group.callers.map((c, i) => (
                  <li key={`${c.file}:${c.line}:${i}`} style={s.callerRow}>
                    <span style={s.callerLinkWrap} title={`${c.file}:${c.line}`}>
                      <MonoLink
                        href={
                          repoFullName && headSha
                            ? githubBlobUrl(repoFullName, headSha, c.file, c.line, c.line)
                            : undefined
                        }
                      >
                        {c.file}:{c.line}
                      </MonoLink>
                    </span>
                    <span style={s.callerSymbol}>{c.name}</span>
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
        </div>
      )}
    </section>
  );
}
