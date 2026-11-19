"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { pageCount } from "./helpers";
import { s } from "./styles";

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const t = useTranslations("projectGraph.pager");
  const pages = pageCount(total, pageSize);
  return (
    <nav aria-label={t("label")} style={s.row}>
      <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t("prev")}
      </Button>
      <span style={s.muted}>{t("page", { page, pages, total })}</span>
      <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t("next")}
      </Button>
    </nav>
  );
}
