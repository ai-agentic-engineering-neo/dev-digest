/* RepoGuard — one :repoId check for every repo-scoped page. A stale or unknown
   id renders the friendly "no repo selected" state instead of the page (and
   instead of each page's own 404 error). Waits for the repo list, so a valid id
   never flashes the empty state. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCrumb } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useRepoNotFound } from "@/lib/repo-context";

function UnknownRepo({ repoId }: { repoId: string }) {
  const t = useTranslations("prReview");
  useCrumb([{ label: repoId, mono: true }, { label: t("list.breadcrumb") }]);
  return <RepoNotFound />;
}

export function RepoGuard({ children }: { children: React.ReactNode }) {
  const { repoId } = useParams<{ repoId: string }>();
  const notFound = useRepoNotFound(repoId);
  return notFound ? <UnknownRepo repoId={repoId} /> : <>{children}</>;
}
