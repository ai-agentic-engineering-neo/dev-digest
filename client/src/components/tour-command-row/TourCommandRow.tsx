"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { copyText } from "@/lib/clipboard";
import { s } from "./styles";

interface TourCommandRowProps {
  index: number;
  command: string;
  note?: string | null;
  copyLabel: string;
  copiedLabel: string;
}

const COPIED_MS = 1500;

/** A numbered shell command with a copy button. The command is only ever copied, never run. */
export function TourCommandRow({ index, command, note, copyLabel, copiedLabel }: TourCommandRowProps) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const copy = async () => {
    if (!(await copyText(command))) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <div style={s.row}>
      <span style={s.index} aria-hidden>
        {index}
      </span>
      <div style={s.main}>
        <code className="mono" style={s.command}>
          {command}
        </code>
        {note ? <div style={s.note}>{note}</div> : null}
      </div>
      <button type="button" style={s.copy} onClick={copy} aria-label={`${copyLabel}: ${command}`}>
        {copied ? <Icon.Check size={15} /> : <Icon.Copy size={15} />}
        {copied ? <span role="status">{copiedLabel}</span> : null}
      </button>
    </div>
  );
}
