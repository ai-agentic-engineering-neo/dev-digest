/* PrDetailSkeleton — placeholder for the PR detail screen, shared by the
   route's loading.tsx and PrDetailView while the PR resolves. */
"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import { s } from "./styles";

export function PrDetailSkeleton() {
  const t = useTranslations("prReview");
  return (
    <div role="status" aria-label={t("detail.loading")} style={s.wrap}>
      <Skeleton height={28} width={420} />
      <Skeleton height={16} width={300} />
      <Skeleton height={200} />
    </div>
  );
}
