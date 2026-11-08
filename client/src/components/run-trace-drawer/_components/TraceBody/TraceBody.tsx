/* TraceBody — the Trace tab content: Configuration (incl. the "Specs read" project-context detail),
   Stats, Findings, Prompt assembly (with the searchable Project-context row), Tool calls, and Raw
   output sections for one persisted RunTrace. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import type { RunTraceView } from "@/lib/types";
import { PROMPT_COLORS } from "../../constants";
import { approxTokens } from "@/lib/tokens";
import { formatSeconds, formatTokens, specsReadView } from "../../helpers";
import { s } from "../../styles";
import { TraceSection } from "../TraceSection";
import { ToolCallRow } from "../ToolCallRow";
import { PromptBlock } from "../PromptBlock";
import { FindingsSection } from "../FindingsSection";
import { ProjectContextPromptRow } from "../ProjectContextPromptRow";
import { SpecsRead } from "../SpecsRead";
import { Row, Stat } from "../atoms";
import { formatCost } from "@/components/run-cost-badge";

export function TraceBody({ trace, findings }: { trace: RunTraceView; findings: FindingRecord[] }) {
  const t = useTranslations("runs");
  const stats = trace.stats;
  // The project-context section exactly as sent (older traces keep their recorded form).
  const specs = trace.prompt_assembly.specs;
  const projectContextLabel = t("trace.prompt.projectContext");
  return (
    <>
      <TraceSection icon="Settings" title={t("trace.configuration")}>
        <div style={s.configList}>
          <Row label={t("trace.config.model")}>
            <span className="mono" style={s.configModel}>
              {trace.config.model}
            </span>
          </Row>
          <Row label={t("trace.config.provider")}>
            <span className="mono" style={s.configProvider}>
              {trace.config.provider ?? "—"}
            </span>
          </Row>
          <Row label={t("trace.config.memoryPulled")}>
            <span>{t("trace.config.items", { count: trace.memory_pulled.length })}</span>
          </Row>
          <Row label={t("trace.config.specsRead")}>
            <SpecsRead view={specsReadView(trace)} />
          </Row>
        </div>
      </TraceSection>

      <TraceSection
        icon="Gauge"
        title={t("trace.stats")}
        right={
          <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check">
            {stats.grounding}
          </Badge>
        }
      >
        <div style={s.statsRow}>
          <Stat label={t("trace.stat.duration")} val={formatSeconds(stats.duration_ms)} />
          <Stat label={t("trace.stat.tokens")} val={formatTokens(stats.tokens_in, stats.tokens_out)} />
          <Stat label={t("trace.stat.cost")} val={formatCost(stats.cost_usd)} />
          <Stat label={t("trace.stat.findings")} val={stats.findings} />
        </div>
      </TraceSection>

      <FindingsSection findings={findings} />

      <TraceSection icon="FileText" title={t("trace.promptAssembly")} defaultOpen={false}>
        <PromptBlock label={t("trace.prompt.system")} text={trace.prompt_assembly.system} color={PROMPT_COLORS.system} />
        {trace.prompt_assembly.skills != null && (
          <PromptBlock
            label={t("trace.prompt.skills")}
            text={trace.prompt_assembly.skills}
            color={PROMPT_COLORS.skills}
            meta={t("trace.prompt.tokensApprox", { count: approxTokens(trace.prompt_assembly.skills) })}
          />
        )}
        {trace.prompt_assembly.memory != null && (
          <PromptBlock label={t("trace.prompt.memory")} text={trace.prompt_assembly.memory} color={PROMPT_COLORS.memory} />
        )}
        {trace.prompt_assembly.repo_map != null && (
          <PromptBlock label={t("trace.prompt.repoMap")} text={trace.prompt_assembly.repo_map} color={PROMPT_COLORS.repoMap} />
        )}
        {specs != null && specs.trim().length > 0 && (
          <ProjectContextPromptRow
            label={projectContextLabel}
            meta={t("trace.prompt.tokensApprox", { count: approxTokens(specs) })}
            color={PROMPT_COLORS.projectContext}
            text={specs}
            labels={{
              search: t("trace.prompt.search"),
              copy: t("trace.prompt.copy"),
              copied: t("drawer.copied"),
              matchCount: (n) => t("trace.prompt.matchCount", { count: n }),
              noMatches: (q) => t("trace.prompt.noLinesMatch", { q }),
              copyRow: t("trace.prompt.copyLabel", { label: projectContextLabel }),
              expand: t("trace.prompt.expandLabel", { label: projectContextLabel }),
            }}
          />
        )}
        {trace.prompt_assembly.callers != null && (
          <PromptBlock label={t("trace.prompt.callers")} text={trace.prompt_assembly.callers} color={PROMPT_COLORS.callers} />
        )}
        <PromptBlock label={t("trace.prompt.user")} text={trace.prompt_assembly.user} color={PROMPT_COLORS.user} />
      </TraceSection>

      <TraceSection
        icon="Wrench"
        title={t("trace.toolCalls")}
        right={<Badge color="var(--text-muted)">{trace.tool_calls.length}</Badge>}
      >
        {trace.tool_calls.length === 0 ? (
          <span style={s.noToolCalls}>{t("trace.noToolCalls")}</span>
        ) : (
          trace.tool_calls.map((tc, i) => <ToolCallRow key={i} tc={tc} />)
        )}
      </TraceSection>

      <TraceSection icon="Code" title={t("trace.rawOutput")} defaultOpen={false}>
        <pre className="mono" style={s.rawPre}>
          {trace.raw_output || "—"}
        </pre>
      </TraceSection>
    </>
  );
}
