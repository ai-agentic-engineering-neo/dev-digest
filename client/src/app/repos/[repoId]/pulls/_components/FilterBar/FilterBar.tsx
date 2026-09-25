/* FilterBar — search box, status chips, sort select, and refresh for the PR list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Chip, Button, TextInput, SelectInput } from "@devdigest/ui";
import { STATUS_FILTERS } from "../../constants";
import { s } from "../../styles";

export function FilterBar({
  active,
  counts,
  onActive,
  query,
  onQuery,
  sort,
  onSort,
  onRefresh,
  refreshing,
}: {
  active: string;
  /** PRs per status filter key ("all" included); counts are hidden while undefined. */
  counts?: Record<string, number>;
  onActive: (k: string) => void;
  query: string;
  onQuery: (v: string) => void;
  sort: string;
  onSort: (v: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const t = useTranslations("prReview");
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
            {counts
              ? t("list.filterCount", { label: t(`list.filter.${labelKey}`), count: counts[key] ?? 0 })
              : t(`list.filter.${labelKey}`)}
          </Chip>
        ))}
      </div>
      <div style={s.filterActions}>
        <SelectInput value={sort} onChange={onSort} options={sortOptions} mono={false} />
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
