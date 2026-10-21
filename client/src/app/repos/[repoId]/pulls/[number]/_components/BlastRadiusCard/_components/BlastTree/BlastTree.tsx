/* BlastTree — one expandable row per changed symbol that has callers: the
   callers as file:line links to GitHub at the PR head (those files are not in
   the diff), then the endpoints and crons the callers reach. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BlastRadius, DownstreamImpact } from "@devdigest/shared";
import { callerHref, kindsByName, symbolLabel } from "../../helpers";
import { s } from "./styles";

function SymbolRow({
  entry,
  label,
  open,
  onToggle,
  repoFullName,
  headSha,
}: {
  entry: DownstreamImpact;
  label: string;
  open: boolean;
  onToggle: () => void;
  repoFullName: string | null;
  headSha: string | null;
}) {
  const t = useTranslations("blast");
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
  return (
    <li>
      <button type="button" style={s.symbolRow} aria-expanded={open} onClick={onToggle}>
        <Chevron size={14} style={s.chevron} />
        <Icon.Code size={13} style={s.codeIcon} />
        <span className="mono">{label}</span>
        <span style={s.spacer} />
        <span style={s.count}>{t("callerCount", { count: entry.callers.length })}</span>
      </button>
      {open && (
        <div style={s.body}>
          <ul style={s.callers}>
            {entry.callers.map((c) => {
              const ref = `${c.file}:${c.line}`;
              const href = callerHref(repoFullName, headSha, c);
              return (
                <li key={`${c.file}:${c.line}:${c.name}`} style={s.callerRow}>
                  <Icon.CornerDownRight size={12} style={s.arrow} />
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="mono" style={s.callerRef} title={c.name}>
                      {ref}
                    </a>
                  ) : (
                    <span className="mono" style={s.callerRef} title={c.name}>
                      {ref}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {(entry.endpoints_affected.length > 0 || entry.crons_affected.length > 0) && (
            <div style={s.chips}>
              {entry.endpoints_affected.map((e) => (
                <span key={e} className="mono" style={s.chip("var(--info)", "var(--info-bg)")}>
                  <Icon.Globe size={12} />
                  {e}
                </span>
              ))}
              {entry.crons_affected.map((c) => (
                <span key={c} className="mono" style={s.chip("var(--warn)", "var(--warn-bg)")}>
                  <Icon.Clock size={12} />
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function BlastTree({
  data,
  repoFullName,
  headSha,
}: {
  data: BlastRadius;
  repoFullName: string | null;
  headSha: string | null;
}) {
  const t = useTranslations("blast");
  // The first (largest) symbol starts open, like the design; the rest collapsed.
  const [open, setOpen] = React.useState<ReadonlySet<string>>(
    () => new Set(data.downstream[0] ? [data.downstream[0].symbol] : []),
  );
  const kinds = kindsByName(data);

  if (data.downstream.length === 0) {
    return <div style={s.empty}>{t("noDownstream", { count: data.changed_symbols.length })}</div>;
  }

  const toggle = (symbol: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });

  return (
    <ul style={s.list}>
      {data.downstream.map((entry) => (
        <SymbolRow
          key={entry.symbol}
          entry={entry}
          label={symbolLabel(entry.symbol, kinds)}
          open={open.has(entry.symbol)}
          onToggle={() => toggle(entry.symbol)}
          repoFullName={repoFullName}
          headSha={headSha}
        />
      ))}
    </ul>
  );
}
