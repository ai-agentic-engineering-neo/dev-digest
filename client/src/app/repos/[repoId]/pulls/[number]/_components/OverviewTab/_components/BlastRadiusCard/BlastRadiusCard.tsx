/* BlastRadiusCard — changed symbols → resolved callers → impacted HTTP
   endpoints/crons, sourced from `GET /pulls/:id/blast` (repoIntel's index,
   no LLM call). One expandable row per changed symbol, reusing the
   one-open-at-a-time expand pattern from IntentCard/RiskAreas.tsx. No
   Tree/Graph toggle in this pass — no graph-rendering primitive exists in
   @devdigest/ui yet; this ships the Tree view only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Chip, SectionLabel, Skeleton, MonoLink } from "@devdigest/ui";
import type { DownstreamImpact } from "@devdigest/shared";
import { useBlastRadius } from "../../../../../../../../../lib/hooks/blast-radius";
import { githubBlobUrl } from "../../../../../../../../../lib/github-urls";
import { s } from "./styles";

interface BlastRadiusCardProps {
  prId: string | null;
  repoFullName: string | null;
  headSha: string | null | undefined;
}

export function BlastRadiusCard({ prId, repoFullName, headSha }: BlastRadiusCardProps) {
  const t = useTranslations("prReview");
  const { data, isLoading } = useBlastRadius(prId);
  const [activeIdx, setActiveIdx] = React.useState<number | null>(null);

  if (!prId || isLoading) {
    return (
      <section>
        <SectionLabel icon="GitBranch">{t("blastRadius.sectionLabel")}</SectionLabel>
        <div style={s.box}>
          <div style={s.skeletonStack}>
            <Skeleton height={14} width="40%" />
            <Skeleton height={14} width="70%" />
          </div>
        </div>
      </section>
    );
  }

  if (data == null) {
    return (
      <section>
        <SectionLabel icon="GitBranch">{t("blastRadius.sectionLabel")}</SectionLabel>
        <div style={s.box}>
          <p style={s.comingSoon}>{t("blastRadius.empty")}</p>
        </div>
      </section>
    );
  }

  const callerCount = data.downstream.reduce((n, d) => n + d.callers.length, 0);
  const endpointCount = new Set(data.downstream.flatMap((d) => d.endpoints_affected)).size;
  const cronCount = new Set(data.downstream.flatMap((d) => d.crons_affected)).size;
  const degraded = /partial index/i.test(data.summary);

  return (
    <section>
      <SectionLabel icon="GitBranch">{t("blastRadius.sectionLabel")}</SectionLabel>
      <div style={s.box}>
        <div style={s.summaryChips}>
          <Chip icon="Code" count={data.changed_symbols.length}>
            {t("blastRadius.symbols")}
          </Chip>
          <Chip icon="Users" count={callerCount}>
            {t("blastRadius.callers")}
          </Chip>
          <Chip icon="Globe" count={endpointCount}>
            {t("blastRadius.endpoints")}
          </Chip>
          {cronCount > 0 && (
            <Chip icon="Clock" count={cronCount}>
              {t("blastRadius.crons")}
            </Chip>
          )}
        </div>

        {degraded ? (
          <p style={s.degradedText}>{data.summary}</p>
        ) : (
          <p style={s.summaryText}>{data.summary}</p>
        )}

        {data.downstream.length === 0 ? (
          <p style={s.comingSoon}>{t("blastRadius.empty")}</p>
        ) : (
          <div style={s.symbolList}>
            <div style={s.symbolChipRow}>
              {data.downstream.map((d, i) => (
                <Chip
                  key={`${d.symbol}-${i}`}
                  icon="Code"
                  count={d.callers.length}
                  active={i === activeIdx}
                  onClick={() => setActiveIdx(i === activeIdx ? null : i)}
                >
                  {d.symbol}
                </Chip>
              ))}
            </div>
            {activeIdx != null && data.downstream[activeIdx] && (
              <SymbolDetail
                impact={data.downstream[activeIdx]!}
                repoFullName={repoFullName}
                headSha={headSha}
                t={t}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function SymbolDetail({
  impact,
  repoFullName,
  headSha,
  t,
}: {
  impact: DownstreamImpact;
  repoFullName: string | null;
  headSha: string | null | undefined;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div style={s.detail}>
      {impact.callers.length === 0 ? (
        <p style={s.emptyCallers}>{t("blastRadius.noCallers")}</p>
      ) : (
        impact.callers.map((caller, i) => {
          const href =
            repoFullName && headSha
              ? githubBlobUrl(repoFullName, headSha, caller.file, caller.line)
              : undefined;
          return (
            <div key={`${caller.file}-${caller.line}-${i}`} style={s.callerRow}>
              <MonoLink href={href}>
                {caller.file}:{caller.line}
              </MonoLink>
              <span style={s.callerName}>{caller.name}</span>
            </div>
          );
        })
      )}
      {(impact.endpoints_affected.length > 0 || impact.crons_affected.length > 0) && (
        <div style={s.factsRow}>
          {impact.endpoints_affected.map((e) => (
            <Badge key={e} icon="Globe" mono>
              {e}
            </Badge>
          ))}
          {impact.crons_affected.map((c) => (
            <Badge key={c} icon="Clock" mono>
              {c}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
