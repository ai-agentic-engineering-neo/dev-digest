/* BlastRadiusCard — changed symbols → resolved callers → impacted HTTP
   endpoints/crons, sourced from `GET /pulls/:id/blast` (repoIntel's index, no
   LLM call).

   Two independent controls, both live in the header row (matches the design
   reference):
     - Tree / Graph — how an expanded symbol's own detail renders. Tree is
       the flat file:line list; Graph is a hand-built inline-SVG node-link
       diagram (BlastRadiusGraph) — no graph-rendering primitive exists in
       @devdigest/ui, so there's no library to reach for either way.
     - The three summary counts (Symbols / Callers / Endpoints) are real tabs,
       not decoration: Symbols is the expandable per-symbol row list (each row
       independently toggleable — several can be open at once, unlike the
       old single-select chip row); Callers flattens every resolved caller
       across every changed symbol into one list; Endpoints flattens every
       impacted HTTP endpoint/cron the same way. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, SectionLabel, Skeleton, MonoLink } from "@devdigest/ui";
import type { BlastRadius, DownstreamImpact } from "@devdigest/shared";
import { useBlastRadius } from "../../../../../../../../../lib/hooks/blast-radius";
import { githubBlobUrl } from "../../../../../../../../../lib/github-urls";
import { PriorPrsSection } from "./PriorPrsSection";
import { BlastRadiusGraph } from "./BlastRadiusGraph";
import { s } from "./styles";

type ViewMode = "tree" | "graph";
type Tab = "symbols" | "callers" | "endpoints";

interface BlastRadiusCardProps {
  prId: string | null;
  repoFullName: string | null;
  headSha: string | null | undefined;
}

export function BlastRadiusCard({ prId, repoFullName, headSha }: BlastRadiusCardProps) {
  const t = useTranslations("prReview");
  const { data, isLoading } = useBlastRadius(prId);
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());
  const [view, setView] = React.useState<ViewMode>("tree");
  const [tab, setTab] = React.useState<Tab>("symbols");

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

  function toggleRow(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <section>
      <SectionLabel
        icon="GitBranch"
        right={
          tab === "symbols" && data.downstream.length > 0 ? (
            <div style={s.viewToggle}>
              <button style={s.viewToggleBtn(view === "tree")} onClick={() => setView("tree")}>
                {t("blastRadius.tree")}
              </button>
              <button style={s.viewToggleBtn(view === "graph")} onClick={() => setView("graph")}>
                {t("blastRadius.graph")}
              </button>
            </div>
          ) : undefined
        }
      >
        {t("blastRadius.sectionLabel")}
      </SectionLabel>
      <div style={s.box}>
        {/* Real tabs: click one to switch what's shown below. */}
        <div style={s.summaryChips}>
          <button
            data-testid="blast-tab-symbols"
            style={s.summaryTab(tab === "symbols")}
            onClick={() => setTab("symbols")}
          >
            <Icon.Code size={12} />
            {data.changed_symbols.length} {t("blastRadius.symbols")}
          </button>
          <button
            data-testid="blast-tab-callers"
            style={s.summaryTab(tab === "callers")}
            onClick={() => setTab("callers")}
          >
            <Icon.Users size={12} />
            {callerCount} {t("blastRadius.callers")}
          </button>
          <button
            data-testid="blast-tab-endpoints"
            style={s.summaryTab(tab === "endpoints")}
            onClick={() => setTab("endpoints")}
          >
            <Icon.Globe size={12} />
            {endpointCount} {t("blastRadius.endpoints")}
          </button>
          {cronCount > 0 && (
            <Badge icon="Clock">
              {cronCount} {t("blastRadius.crons")}
            </Badge>
          )}
        </div>

        {degraded ? (
          <p style={s.degradedText}>{data.summary}</p>
        ) : (
          <p style={s.summaryText}>{data.summary}</p>
        )}

        {data.downstream.length === 0 ? (
          <p style={s.comingSoon}>{t("blastRadius.empty")}</p>
        ) : tab === "symbols" ? (
          <div style={s.symbolList}>
            {data.downstream.map((d, i) => (
              <SymbolRow
                key={`${d.symbol}-${i}`}
                symbol={d}
                symbolFile={data.changed_symbols[i]?.file ?? ""}
                open={expanded.has(i)}
                onToggle={() => toggleRow(i)}
                view={view}
                repoFullName={repoFullName}
                headSha={headSha}
                t={t}
              />
            ))}
          </div>
        ) : tab === "callers" ? (
          <FlatCallersList data={data} repoFullName={repoFullName} headSha={headSha} t={t} />
        ) : (
          <FlatEndpointsList data={data} t={t} />
        )}

        <PriorPrsSection prId={prId} repoFullName={repoFullName} />
      </div>
    </section>
  );
}

function SymbolRow({
  symbol,
  symbolFile,
  open,
  onToggle,
  view,
  repoFullName,
  headSha,
  t,
}: {
  symbol: DownstreamImpact;
  symbolFile: string;
  open: boolean;
  onToggle: () => void;
  view: ViewMode;
  repoFullName: string | null;
  headSha: string | null | undefined;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div style={s.symbolRow}>
      <button style={s.symbolRowHeader} onClick={onToggle}>
        <Icon.ChevronDown size={13} style={s.symbolRowChevron(open)} />
        <span style={s.symbolRowName}>{symbol.symbol}()</span>
        <span style={s.symbolRowCount}>
          {symbol.callers.length} {t("blastRadius.callers")}
        </span>
      </button>
      {open &&
        (view === "tree" ? (
          <SymbolDetail
            impact={symbol}
            repoFullName={repoFullName}
            headSha={headSha}
            t={t}
            wrapperStyle={s.symbolRowDetail}
          />
        ) : (
          <div style={s.symbolRowDetail}>
            <BlastRadiusGraph
              symbol={symbol.symbol}
              symbolFile={symbolFile}
              impact={symbol}
              repoFullName={repoFullName}
              headSha={headSha}
            />
          </div>
        ))}
    </div>
  );
}

function SymbolDetail({
  impact,
  repoFullName,
  headSha,
  t,
  wrapperStyle,
}: {
  impact: DownstreamImpact;
  repoFullName: string | null;
  headSha: string | null | undefined;
  t: ReturnType<typeof useTranslations>;
  wrapperStyle?: React.CSSProperties;
}) {
  return (
    <div style={wrapperStyle ?? s.detail}>
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
              <span style={s.callerFile}>
                <MonoLink href={href}>
                  {caller.file}:{caller.line}
                </MonoLink>
              </span>
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

/** Callers tab: every resolved caller, across every changed symbol, flattened into one list. */
function FlatCallersList({
  data,
  repoFullName,
  headSha,
  t,
}: {
  data: BlastRadius;
  repoFullName: string | null;
  headSha: string | null | undefined;
  t: ReturnType<typeof useTranslations>;
}) {
  const rows = data.downstream.flatMap((d) => d.callers.map((c) => ({ ...c, viaSymbol: d.symbol })));
  if (rows.length === 0) {
    return <p style={s.comingSoon}>{t("blastRadius.noCallers")}</p>;
  }
  return (
    <div style={s.detail}>
      {rows.map((caller, i) => {
        const href =
          repoFullName && headSha
            ? githubBlobUrl(repoFullName, headSha, caller.file, caller.line)
            : undefined;
        return (
          <div key={`${caller.file}-${caller.line}-${caller.viaSymbol}-${i}`} style={s.callerRow}>
            <span style={s.callerFile}>
              <MonoLink href={href}>
                {caller.file}:{caller.line}
              </MonoLink>
            </span>
            <span style={s.callerName}>
              {caller.name} → {caller.viaSymbol}()
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Endpoints tab: every impacted endpoint/cron, across every changed symbol, deduped. */
function FlatEndpointsList({
  data,
  t,
}: {
  data: BlastRadius;
  t: ReturnType<typeof useTranslations>;
}) {
  const endpoints = [...new Set(data.downstream.flatMap((d) => d.endpoints_affected))];
  const crons = [...new Set(data.downstream.flatMap((d) => d.crons_affected))];
  if (endpoints.length === 0 && crons.length === 0) {
    return <p style={s.comingSoon}>{t("blastRadius.empty")}</p>;
  }
  return (
    <div style={s.factsRow}>
      {endpoints.map((e) => (
        <Badge key={e} icon="Globe" mono>
          {e}
        </Badge>
      ))}
      {crons.map((c) => (
        <Badge key={c} icon="Clock" mono>
          {c}
        </Badge>
      ))}
    </div>
  );
}
