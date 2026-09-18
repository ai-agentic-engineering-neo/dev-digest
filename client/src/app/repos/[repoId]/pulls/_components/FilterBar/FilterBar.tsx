/* FilterBar — search box, status chips, sort select, and refresh for the PR list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Chip, Button, TextInput, SelectInput } from "@devdigest/ui";
import { STATUS_FILTERS } from "../../constants";
import { relativeTime } from "../../helpers";
import { s } from "../../styles";

export function FilterBar({
  active,
  onActive,
  query,
  onQuery,
  sort,
  onSort,
  onRefresh,
  refreshing,
  lastSyncedAt,
}: {
  active: string;
  onActive: (k: string) => void;
  query: string;
  onQuery: (v: string) => void;
  sort: string;
  onSort: (v: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  /** `repos.last_polled_at`; null/undefined ⇒ never synced, render nothing. */
  lastSyncedAt?: string | null;
}) {
  const t = useTranslations("prReview");
  // relativeTime() is shared with the Updated column and yields bare
  // "now"/"12m"/"3h"/"2d" (no "ago"). The wording lives HERE rather than in the
  // helper, so PRRow's column keeps its terse form.
  const rel = lastSyncedAt ? relativeTime(lastSyncedAt) : null;
  const lastSyncedLabel =
    rel == null || rel === "—" ? null : rel === "now" ? "Last synced just now" : `Last synced ${rel} ago`;
  const sortOptions = [
    { value: "newest", label: t("list.sort.newest") },
    { value: "oldest", label: t("list.sort.oldest") },
  ];
  return (
    <div style={s.filterBar}>
      <div style={s.filterChips}>
        <div style={{ width: 240 }}>
          <TextInput value={query} onChange={onQuery} placeholder={t("list.filterPlaceholder")} />
        </div>
        {STATUS_FILTERS.map(({ key, labelKey }) => (
          <Chip key={key} active={active === key} onClick={() => onActive(key)}>
            {t(`list.filter.${labelKey}`)}
          </Chip>
        ))}
      </div>
      <div style={s.filterActions}>
        <SelectInput value={sort} onChange={onSort} options={sortOptions} mono={false} />
        {lastSyncedLabel && <span style={s.lastSynced}>{lastSyncedLabel}</span>}
        <Button
          kind="secondary"
          size="sm"
          icon="RefreshCw"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? t("list.refreshing") : t("list.refresh")}
        </Button>
      </div>
    </div>
  );
}
