/* ProjectContextPromptRow — the "Project context" row of the trace's Prompt assembly: label,
   token estimate, Copy (whole section) and Expand (opens PromptSearchModal; focus returns to the
   Expand button on close). Real buttons only — no clickable header div. Presentational: every
   string arrives via props. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "../../styles";
import { PromptSearchModal, type PromptSearchLabels } from "../PromptSearchModal";

export interface ProjectContextPromptRowProps {
  label: string;
  /** Muted note next to the label ("~412 tokens"). */
  meta: string;
  color: string;
  /** The section exactly as recorded in the trace. */
  text: string;
  labels: PromptSearchLabels & { copyRow: string; expand: string };
}

const COPIED_MS = 1200;

const miniBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 4,
  borderRadius: 5,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text-muted)",
  cursor: "pointer",
};

export function ProjectContextPromptRow({ label, meta, color, text, labels }: ProjectContextPromptRowProps) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const expandRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(id);
  }, [copied]);

  const copy = () => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
  };

  const close = () => {
    setOpen(false);
    expandRef.current?.focus();
  };

  return (
    <div style={s.promptRow}>
      <div style={{ ...s.promptHead, cursor: "default" }}>
        <span style={s.promptDot(color)} />
        <span style={s.promptLabel}>{label}</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{meta}</span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" title={labels.copyRow} aria-label={labels.copyRow} onClick={copy} style={miniBtn}>
            {copied ? <Icon.Check size={12} /> : <Icon.Copy size={12} />}
          </button>
          <button
            ref={expandRef}
            type="button"
            title={labels.expand}
            aria-label={labels.expand}
            onClick={() => setOpen(true)}
            style={miniBtn}
          >
            <Icon.ExternalLink size={12} />
          </button>
        </span>
      </div>
      {open && <PromptSearchModal title={label} text={text} labels={labels} onClose={close} />}
    </div>
  );
}
