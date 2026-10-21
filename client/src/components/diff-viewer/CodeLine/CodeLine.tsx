/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { SEV, Icon, type Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import type { DiffFindingApi } from "../findings";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor, stripeFor, pillFor } from "../styles";
import { FindingComment } from "../FindingComment";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  stripe,
  pill,
  findingsAfter,
  findingApi,
  highlighted,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  stripe?: Severity;
  pill?: Severity;
  findingsAfter?: FindingRecord[];
  findingApi?: DiffFindingApi;
  /** A deep link points at this line: tint it for a moment. */
  highlighted?: boolean;
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
  const showFindings = !!findingApi?.show;

  return (
    <div
      style={cs.rowWrap}
      data-line={ln.kind !== "del" ? ln.newNo : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ ...lineRowFor(ln.kind), ...(showFindings && stripe ? stripeFor(SEV[stripe].c) : {}), ...(highlighted ? { background: "var(--accent-bg)" } : {}) }}>
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
        {showFindings && pill && (
          <span style={pillFor(SEV[pill].c)}>
            {(() => {
              const I = Icon[SEV[pill].icon];
              return <I size={11} />;
            })()}
            {SEV[pill].label.toLowerCase()}
          </span>
        )}
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {showFindings &&
        findingApi &&
        findingsAfter?.map((f) => (
          <FindingComment
            key={f.id}
            finding={f}
            pending={findingApi.pendingId === f.id}
            onAction={findingApi.onAction}
          />
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
