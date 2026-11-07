"use client";

import { useTranslations } from "next-intl";
import { Badge, MonoLink } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import type { BlastDownstream } from "@/lib/types";
import { BlastChips } from "../BlastChips";
import { s } from "./styles";

export function BlastSymbolCard({
  item,
  repoFullName,
  linkSha,
}: {
  item: BlastDownstream;
  repoFullName: string | null;
  linkSha: string;
}) {
  const t = useTranslations("blast");

  return (
    <div style={s.card}>
      <div style={s.header}>
        <span className="mono" style={s.symbol}>
          {item.symbol}
        </span>
        <Badge>{t("callerCount", { count: item.callers.length })}</Badge>
        <span className="mono" style={s.file}>
          {item.file}
        </span>
      </div>
      <ul style={s.list}>
        {item.callers.map((c) => {
          const location = `${c.file}:${c.line}`;
          return (
            <li key={`${c.file}:${c.line}:${c.name}`} style={s.row}>
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
      <BlastChips kind="endpoint" label={t("chips.endpoints")} items={item.endpoints_affected} />
      <BlastChips kind="cron" label={t("chips.crons")} items={item.crons_affected} />
    </div>
  );
}
