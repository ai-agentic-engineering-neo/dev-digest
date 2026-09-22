/* FindingsHoverCard — the panel that opens when a PR row's FINDINGS cell is
   hovered or focused: every still-outstanding finding of that PR.

   Portalled to <body> on purpose. The PR table (`s.tableCard`) sets
   `overflow: hidden` for its rounded corners, so a panel rendered inside the
   row would be clipped; the kit's Dropdown is absolutely positioned and would
   hit the same wall (and it only renders flat label rows). */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Icon, SEV, CategoryTag, ConfidenceNum, Skeleton } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { fileRef } from "./helpers";
import { SKELETON_ROWS } from "./constants";
import { c } from "./styles";

export function FindingsHoverCard({
  id,
  findings,
  isLoading,
  isError,
  top,
  left,
  onMouseEnter,
  onMouseLeave,
}: {
  id: string;
  findings: FindingRecord[];
  isLoading: boolean;
  isError: boolean;
  top: number;
  left: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const t = useTranslations("prReview");
  // Client-only: the card is opened by a pointer/focus event, so it never
  // renders on the server — but guard anyway, createPortal needs a document.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      id={id}
      role="dialog"
      aria-label={t("list.findings.cardAria")}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={c.card(top, left)}
    >
      <div style={c.header}>
        <Icon.AlertOctagon size={13} />
        {isLoading
          ? t("list.findings.loading")
          : t("list.findings.cardTitle", { count: findings.length })}
      </div>

      {isError ? (
        <div style={c.state}>{t("list.findings.error")}</div>
      ) : isLoading ? (
        <div style={c.skeletonStack}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} height={34} />
          ))}
        </div>
      ) : (
        <div style={c.body}>
          {findings.map((f) => {
            const sev = SEV[f.severity];
            const I = Icon[sev.icon];
            return (
              <div key={f.id} style={c.item}>
                <div style={c.itemHead}>
                  <I size={13} style={c.itemIcon(sev.c)} />
                  <span style={c.itemTitle}>{f.title}</span>
                </div>
                <div style={c.itemMeta}>
                  <CategoryTag category={f.category} />
                  <span className="mono" style={c.itemFile}>
                    {fileRef(f)}
                  </span>
                  <ConfidenceNum value={f.confidence} />
                </div>
                <div style={c.itemRationale}>{f.rationale}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>,
    document.body,
  );
}
