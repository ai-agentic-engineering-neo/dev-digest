/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, an inline composer, and
   (L03) the finding marker + inline finding cards for this line. */
"use client";

import React from "react";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";
import { FindingMarker } from "../FindingMarker";
import type { DiffFindingApi } from "../findings";
import { SEVERITY_RANK, isActiveFinding } from "@/lib/severity";
import { SEV } from "@devdigest/ui";

/** Highest severity in the list, ignoring dismissed state (used only for the
    muted "all dismissed" case — active findings use `isActiveFinding`). */
function topSeverityOf(fs: FindingRecord[]): Severity | null {
  let best: Severity | null = null;
  for (const f of fs) {
    if (best === null || SEVERITY_RANK[f.severity] < SEVERITY_RANK[best]) best = f.severity;
  }
  return best;
}

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  lineFindings,
  findingApi,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  lineFindings?: FindingRecord[];
  findingApi?: DiffFindingApi;
}) {
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const [findingsOpen, setFindingsOpen] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const findings = lineFindings ?? [];
  const activeFindings = findings.filter(isActiveFinding);
  const muted = findings.length > 0 && activeFindings.length === 0;
  const topSeverity = activeFindings.length > 0 ? topSeverityOf(activeFindings) : topSeverityOf(findings);
  const labelCount = activeFindings.length > 0 ? activeFindings.length : findings.length;

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={lineRowFor(ln.kind, topSeverity ? SEV[topSeverity].c : undefined, muted)}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {topSeverity && (
          <FindingMarker
            severity={topSeverity}
            count={labelCount}
            muted={muted}
            open={findingsOpen}
            onClick={() => setFindingsOpen((o) => !o)}
          />
        )}
      </div>

      {findingApi && findingsOpen && findings.length > 0 && (
        <div style={s.findingCardsWrap}>
          {[...findings]
            .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
            .map((f) => (
              <findingApi.Card
                key={f.id}
                f={f}
                defaultExpanded
                pending={findingApi.pending}
                onAction={(a) => findingApi.onAction(f.id, a)}
              />
            ))}
        </div>
      )}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
