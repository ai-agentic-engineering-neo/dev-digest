/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import type { FindingRecord } from "@devdigest/shared";
import type { DiffFindingApi } from "../findings";
import { FindingCard } from "@/components/finding-card";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "@/components/finding-card/constants";
import { FindingLineTag, topSeverity } from "../FindingLineTag";
import { s, lineRowFor, lineSignFor, findingBarFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings = [],
  findingApi,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  findings?: FindingRecord[];
  findingApi?: DiffFindingApi;
}) {
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const hasFindings = !!findingApi && findings.length > 0;
  const top = hasFindings ? topSeverity(findings) : undefined;
  const barColor = top ? (SEV_COLOR[top] ?? SEV_COLOR_FALLBACK) : null;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ ...lineRowFor(ln.kind), ...(barColor ? findingBarFor(barColor) : null) }}>
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
        {hasFindings && <FindingLineTag findings={findings} />}
      </div>

      {findingApi &&
        findings.map((f) => (
          <div key={f.id} style={s.findingRail}>
            <FindingCard
              f={f}
              defaultExpanded
              onAction={(a) => findingApi.onAction(f.id, a)}
              pending={findingApi.pendingFindingId === f.id}
              repoFullName={findingApi.repoFullName}
              headSha={findingApi.headSha}
            />
          </div>
        ))}

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
