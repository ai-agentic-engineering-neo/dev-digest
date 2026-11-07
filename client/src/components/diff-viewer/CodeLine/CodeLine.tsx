/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { SeverityBadge } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "../../finding-card";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { activeFindings, lineSeverities, topSeverity, type DiffFindingApi } from "../findings";
import { s, lineRowFor, lineSignFor, findingBarFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings,
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
  const lineFindings = findingApi ? (findings ?? []) : [];
  const active = activeFindings(lineFindings);
  const top = topSeverity(active);
  const rowStyle = {
    ...lineRowFor(ln.kind),
    ...(top ? findingBarFor(SEV_COLOR[top] ?? SEV_COLOR_FALLBACK) : null),
  };

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={rowStyle}>
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
        {findingApi && active.length > 0 && (
          <span style={s.findingIcons}>
            {lineSeverities(active).map((sev) => (
              <span key={sev} role="img" aria-label={findingApi.labels.line[sev]} title={findingApi.labels.line[sev]}>
                <SeverityBadge severity={sev} compact />
              </span>
            ))}
          </span>
        )}
      </div>

      {findingApi && findingApi.show && lineFindings.length > 0 && (
        <div style={s.findingCards}>
          {lineFindings.map((f) => (
            <React.Fragment key={f.id}>{findingApi.renderCard(f)}</React.Fragment>
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
