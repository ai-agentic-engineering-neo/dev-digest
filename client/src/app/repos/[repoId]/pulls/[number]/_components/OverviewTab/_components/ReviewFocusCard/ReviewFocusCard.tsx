/* ReviewFocusCard — where to read first: `path:line — reason` rows in model order,
   each opening Files changed at that place. Model text is plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Card, Icon } from "@devdigest/ui";
import type { PrBriefFocusItem } from "@devdigest/shared";
import { formatFocusRef } from "../../helpers";
import { s } from "./styles";

export function ReviewFocusCard({
  items,
  onOpen,
}: {
  items: PrBriefFocusItem[];
  onOpen: (path: string, line: number | null) => void;
}) {
  const t = useTranslations("brief.focus");
  return (
    <Card>
      <div style={s.headRow}>
        <span style={s.label}>
          <Icon.ListChecks size={14} />
          {t("title")}
        </span>
        <Badge>{t("count", { count: items.length })}</Badge>
      </div>
      {items.length === 0 ? (
        <p style={s.empty}>{t("empty")}</p>
      ) : (
        <ul style={s.list}>
          {items.map((item, i) => {
            const ref = formatFocusRef(item);
            return (
              <li key={`${ref}:${i}`}>
                <button
                  type="button"
                  style={s.row}
                  aria-label={t("openRow", { ref })}
                  onClick={() => onOpen(item.path, item.line)}
                >
                  <span className="mono" style={s.ref}>
                    {ref}
                  </span>
                  <span>— {item.reason}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
