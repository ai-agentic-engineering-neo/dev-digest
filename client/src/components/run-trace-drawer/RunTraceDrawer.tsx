/* RunTraceDrawer — A5 Run Trace + Live Log drawer (720px). Ported from
   screen_trace.jsx. Tabs: Trace (Configuration / Stats / Prompt assembly /
   Tool calls / Raw output) and Live log (SSE via useRunEvents → LiveLogStream,
   which has client-side Filter-input search). Default export so the PR-detail
   page (A2) can mount it from the run-status area. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer, LiveLogStream, Tabs, type LogLine } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { useRunTrace } from "@/lib/hooks/trace";
import { useRunEvents } from "@/lib/hooks/reviews";
import { DRAWER_WIDTH, LOG_HEIGHT, TABS } from "./constants";
import { eventsToLog, traceLog } from "./helpers";
import { s } from "./styles";
import { TraceBody } from "./_components/TraceBody";

export interface RunTraceDrawerProps {
  runId: string;
  /** Title context (agent name / PR number). */
  agentName?: string | null;
  prNumber?: number | null;
  /** Persisted findings of this run (shown in the Findings section). */
  findings?: FindingRecord[];
  /** When true, the drawer defaults to the live log and streams SSE. */
  running?: boolean;
  onClose: () => void;
}

/**
 * Run Trace + Live Log drawer. While `running`, the Live-log tab streams events
 * over SSE (useRunEvents). The Trace tab loads the persisted single-document
 * RunTrace (useRunTrace) once the run completes (or for historical runs).
 */
export default function RunTraceDrawer({
  runId,
  agentName,
  prNumber,
  findings = [],
  running = false,
  onClose,
}: RunTraceDrawerProps) {
  const t = useTranslations("runs");
  const [tab, setTab] = React.useState<string>(running ? "log" : "trace");
  const { events, running: liveRunning } = useRunEvents(running ? [runId] : []);
  // Load the persisted trace once we're not (or no longer) running.
  const stillRunning = running && liveRunning;
  const { data: trace, isLoading } = useRunTrace(runId, !stillRunning);

  // Copy the model's raw output to the clipboard (footer button), with a brief
  // visual confirmation. Disabled until the trace (and its raw output) loads.
  const [rawCopied, setRawCopied] = React.useState(false);
  const copyRaw = () => {
    if (!trace?.raw_output) return;
    void navigator.clipboard?.writeText(trace.raw_output);
    setRawCopied(true);
    setTimeout(() => setRawCopied(false), 1500);
  };

  const log: LogLine[] = eventsToLog(events);
  // When historical, fall back to the trace's persisted log for the Live-log tab.
  const persistedLog: LogLine[] = traceLog(trace);
  const shownLog = running ? log : persistedLog;

  const prCtx = prNumber != null ? `${t("drawer.pr", { number: prNumber })} · ` : "";
  const subtitle = `${prCtx}${stillRunning ? t("drawer.running") : t("drawer.completed")}`;

  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={t("drawer.title", { agent: agentName ?? trace?.config.agent ?? t("drawer.run") })}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button
            kind="secondary"
            size="sm"
            icon={rawCopied ? "Check" : "Copy"}
            onClick={copyRaw}
            disabled={!trace?.raw_output}
          >
            {rawCopied ? t("drawer.copied") : t("drawer.copyRawOutput")}
          </Button>
        </div>
      }
    >
      <Tabs tabs={[...TABS]} value={tab} onChange={setTab} pad="0" />
      <div style={s.tabBody}>
        {tab === "trace" ? (
          isLoading && !trace ? (
            <div style={s.emptyNote}>
              {stillRunning ? t("drawer.tracePending") : t("drawer.loadingTrace")}
            </div>
          ) : trace ? (
            <TraceBody trace={trace} findings={findings} />
          ) : (
            <div style={s.emptyNote}>{t("drawer.noTrace")}</div>
          )
        ) : (
          <LiveLogStream log={shownLog} running={stillRunning} height={LOG_HEIGHT} />
        )}
      </div>
    </Drawer>
  );
}
