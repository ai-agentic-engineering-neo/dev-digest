/* ContextDocPreview — one project-context doc: path, source, token estimate, attached-agents count
   and the rendered markdown. Presentational (no next-intl: it is mounted in /showcase), so every
   label arrives translated. Doc content is untrusted: kit Markdown renders no raw HTML; the path
   is plain text. */
import React from "react";
import { Badge, Markdown } from "@devdigest/ui";
import type { ContextDoc } from "@/lib/types";
import { s } from "./styles";

export interface ContextDocPreviewLabels {
  /** Translated source label ("specs"). */
  source: string;
  /** Translated token estimate ("~820 tokens"). */
  tokens: string;
  /** Translated attached-agents count ("2 agents"). */
  attachedAgents: string;
  /** Label of the path line ("Path"). */
  path: string;
}

export interface ContextDocPreviewProps {
  doc: ContextDoc;
  content: string;
  labels: ContextDocPreviewLabels;
  /** Optional control in the header (the agent Context tab puts its Attach toggle here). */
  action?: React.ReactNode;
}

export function ContextDocPreview({ doc, content, labels, action }: ContextDocPreviewProps) {
  return (
    <article style={s.root}>
      <header style={s.header}>
        <div style={s.headerText}>
          <span style={s.pathLabel}>{labels.path}</span>
          <span className="mono" style={s.path} title={doc.path}>
            {doc.path}
          </span>
          <div style={s.meta}>
            <Badge>{labels.source}</Badge>
            <span style={s.metaText}>{labels.tokens}</span>
            <span style={s.metaText}>{labels.attachedAgents}</span>
          </div>
        </div>
        {action && <div style={s.action}>{action}</div>}
      </header>
      <div style={s.body}>
        <Markdown>{content}</Markdown>
      </div>
    </article>
  );
}
