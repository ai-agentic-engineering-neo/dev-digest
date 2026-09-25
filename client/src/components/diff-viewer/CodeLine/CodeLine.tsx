/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { topSeverity, type DiffFindingApi, type DiffFindingItem } from "../findings";
import { SEVERITY_LABEL_KEY } from "../constants";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor, findingBadgeFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine<T extends DiffFindingItem>({
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
  findings?: T[];
  findingApi?: DiffFindingApi<T>;
}) {
  const t = useTranslations("shell");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  // The line's severity badge collapses/expands its finding cards (the global
  // comments/findings toggle still hides every card).
  const [cardsOpen, setCardsOpen] = React.useState(true);

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
  const lineFindings = findings ?? [];
  const sev = topSeverity(lineFindings);
  const cardsShown = !!findingApi?.show && lineFindings.length > 0;
  const SevIcon = sev ? Icon[SEV[sev].icon] : null;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={lineRowFor(ln.kind, sev)}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title={t("diffViewer.addComment")}
              aria-label={t("diffViewer.addComment")}
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
        {sev && SevIcon &&
          (cardsShown ? (
            <button
              type="button"
              aria-expanded={cardsOpen}
              title={t(cardsOpen ? "diffViewer.hideFinding" : "diffViewer.showFinding")}
              onClick={() => setCardsOpen((o) => !o)}
              style={findingBadgeFor(sev, true)}
            >
              <SevIcon size={12} aria-hidden />
              {t(SEVERITY_LABEL_KEY[sev])}
            </button>
          ) : (
            <span style={findingBadgeFor(sev, false)}>
              <SevIcon size={12} aria-hidden />
              {t(SEVERITY_LABEL_KEY[sev])}
            </span>
          ))}
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {findingApi && cardsShown && cardsOpen && (
        <div style={cs.thread}>{lineFindings.map((item) => <React.Fragment key={item.id}>{findingApi.renderCard(item)}</React.Fragment>)}</div>
      )}

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
