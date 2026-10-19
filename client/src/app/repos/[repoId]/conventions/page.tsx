/* Conventions — /repos/:repoId/conventions (L02). Extract house-rules from the
   repo, review each candidate, compose the accepted ones into one skill. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ConventionsView } from "./_components/ConventionsView";

export default function ConventionsPage() {
  const t = useTranslations("conventions");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  return (
    <AppShell crumb={crumb}>
      {repoNotFound ? (
        <RepoNotFound />
      ) : (
        <ConventionsView key={repoId} repoId={repoId} repo={activeRepo} />
      )}
    </AppShell>
  );
}
