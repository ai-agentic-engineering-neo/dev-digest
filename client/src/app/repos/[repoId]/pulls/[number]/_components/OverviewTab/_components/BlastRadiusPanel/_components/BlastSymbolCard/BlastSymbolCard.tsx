"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, MonoLink } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import type { BlastDownstream } from "@/lib/types";
import { BlastChips } from "../BlastChips";
import { s } from "./styles";

/** One changed symbol as a collapsible tree node (collapsed by default): callers (file:line) with branch lines, then endpoint/cron chips. */
export function BlastSymbolCard({
  item,
  repoFullName,
  linkSha,
  defaultOpen = false,
}: {
  item: BlastDownstream;
  repoFullName: string | null;
  linkSha: string;
  defaultOpen?: boolean;
}) {
  const t = useTranslations("blast");
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <div style={s.node}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        aria-label={t(open ? "toggle.collapse" : "toggle.expand", { symbol: item.symbol, count: item.callers.length })}
        onClick={() => setOpen((v) => !v)}
        style={open ? s.headerOpen : s.header}
        title={item.file}
      >
        <Icon.ChevronRight size={13} aria-hidden style={open ? s.chevronOpen : s.chevron} />
        <Icon.Code size={13} aria-hidden style={s.symbolIcon} />
        <span className="mono" style={s.symbol}>
          {item.symbol}
        </span>
        <span style={s.count}>{t("callerCount", { count: item.callers.length })}</span>
      </button>
      {open && (
        <div id={bodyId} style={s.body}>
          <ul style={s.list}>
            {item.callers.map((c, i) => {
              const location = `${c.file}:${c.line}`;
              const last = i === item.callers.length - 1;
              return (
                <li key={`${c.file}:${c.line}:${c.name}`} style={s.row}>
                  <span aria-hidden style={last ? s.branchLast : s.branch} />
                  <span aria-hidden style={s.tick} />
                  <Icon.CornerDownRight size={13} aria-hidden style={s.rowIcon} />
                  {repoFullName === null ? (
                    <span className="mono" style={s.location}>
                      {location}
                    </span>
                  ) : (
                    <MonoLink href={githubBlobUrl(repoFullName, linkSha, c.file, c.line)}>{location}</MonoLink>
                  )}
                  <span className="mono" style={s.caller}>
                    {c.name}
                  </span>
                </li>
              );
            })}
          </ul>
          <div style={s.chips}>
            <BlastChips kind="endpoint" label={t("chips.endpoints")} items={item.endpoints_affected} />
            <BlastChips kind="cron" label={t("chips.crons")} items={item.crons_affected} />
          </div>
        </div>
      )}
    </div>
  );
}
