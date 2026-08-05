/* 404 for any URL that matches no route segment. Rendered inside the root
   layout, so the provider stack (theme, intl) is available. */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorView } from "../components/error-view";

export default function NotFound() {
  const t = useTranslations("common");
  const router = useRouter();
  return (
    <ErrorView
      icon="Search"
      title={t("notFound.title")}
      body={t("notFound.body")}
      cta={t("notFound.cta")}
      onCta={() => router.push("/")}
    />
  );
}
