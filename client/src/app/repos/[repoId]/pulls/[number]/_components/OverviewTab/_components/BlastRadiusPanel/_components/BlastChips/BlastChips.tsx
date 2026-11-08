"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import { MAX_CHIPS } from "./constants";
import { splitChips } from "./helpers";
import { s } from "./styles";

export function BlastChips({
  items,
  kind,
  label,
}: {
  items: string[];
  kind: "endpoint" | "cron";
  label: string;
}) {
  const t = useTranslations("blast");
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const { shown, hidden } = splitChips(items, MAX_CHIPS);
  const visible = expanded ? items : shown;
  const isEndpoint = kind === "endpoint";

  return (
    <div role="group" aria-label={label} style={s.group}>
      {visible.map((item) => (
        <Badge
          key={item}
          mono
          icon={isEndpoint ? "Globe" : "Clock"}
          color={isEndpoint ? "var(--accent-text)" : "var(--warn)"}
          bg={isEndpoint ? "var(--accent-bg)" : "var(--warn-bg)"}
        >
          {item}
        </Badge>
      ))}
      {hidden > 0 && (
        <button type="button" style={s.more} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? t("chips.less") : t("chips.more", { count: hidden })}
        </button>
      )}
    </div>
  );
}
