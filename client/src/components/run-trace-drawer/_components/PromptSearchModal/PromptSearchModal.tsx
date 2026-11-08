/* PromptSearchModal — a prompt section shown exactly as sent, with a literal line filter, match
   highlighting and Copy (always the WHOLE text). Escape closes it and Tab stays inside (focus trap
   on a wrapper, since the kit Modal has no key handling). The text is untrusted: plain text in a
   <pre>, never markdown. Presentational: every string arrives via `labels`. */
"use client";

import React from "react";
import { Button, Icon, Modal } from "@devdigest/ui";
import { highlightParts, matchLines } from "./helpers";
import { useFocusTrap } from "./hooks/useFocusTrap";
import { s } from "./styles";

export interface PromptSearchLabels {
  /** Placeholder + accessible name of the search box ("Search in this block…"). */
  search: string;
  copy: string;
  copied: string;
  /** "2 lines" */
  matchCount: (lines: number) => string;
  /** "No lines match “q”" */
  noMatches: (q: string) => string;
}

export interface PromptSearchModalProps {
  title: string;
  text: string;
  labels: PromptSearchLabels;
  onClose: () => void;
}

const COPIED_MS = 1200;

export function PromptSearchModal({ title, text, labels, onClose }: PromptSearchModalProps) {
  const [query, setQuery] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const onKeyDown = useFocusTrap(wrapRef, onClose);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(id);
  }, [copied]);

  const copy = () => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
  };

  const lines = query === "" ? null : matchLines(text, query);

  return (
    <div ref={wrapRef} onKeyDown={onKeyDown}>
      <Modal
        width={900}
        title={title}
        onClose={onClose}
        footer={
          <Button kind="secondary" size="sm" icon={copied ? "Check" : "Copy"} onClick={copy}>
            {copied ? labels.copied : labels.copy}
          </Button>
        }
      >
        <div style={s.searchRow}>
          <Icon.Search size={14} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.search}
            aria-label={labels.search}
            style={s.input}
          />
          {lines && <span style={s.count}>{labels.matchCount(lines.length)}</span>}
        </div>
        <pre className="mono" style={s.pre}>
          {lines === null
            ? text
            : lines.length === 0
              ? <span style={s.empty}>{labels.noMatches(query)}</span>
              : lines.map((line, i) => (
                  <div key={i}>
                    {highlightParts(line, query).map((p, j) =>
                      p.match ? (
                        <mark key={j} style={s.mark}>
                          {p.text}
                        </mark>
                      ) : (
                        <React.Fragment key={j}>{p.text}</React.Fragment>
                      ),
                    )}
                  </div>
                ))}
        </pre>
      </Modal>
    </div>
  );
}
