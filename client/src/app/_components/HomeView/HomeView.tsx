/* Home screen — redirects to the first repo's PR list, or offers onboarding
   when the workspace has no repos yet. Extracted from app/page.tsx so the
   route file stays a thin Server Component and this view is testable in RTL. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useRepos } from "@/lib/hooks";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-shell";
import { EmptyState, Button, Skeleton } from "@devdigest/ui";
import { s } from "./styles";

export function HomeView() {
  const router = useRouter();
  const { data: repos, isLoading, isError } = useRepos();

  React.useEffect(() => {
    if (repos && repos.length > 0) {
      router.replace(`/repos/${repos[0]!.id}/pulls`);
    }
  }, [repos, router]);

  return (
    <AppShell crumb={[{ label: "DevDigest" }]}>
      <PageContainer title="Welcome to DevDigest" subtitle="Local-first AI PR review">
        {isLoading ? (
          <div style={s.skeletonStack}>
            <Skeleton height={20} width={240} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </div>
        ) : isError || !repos || repos.length === 0 ? (
          <EmptyState
            icon="GitBranch"
            title="No repositories yet"
            body="Add a repository to start reviewing pull requests. Set your API keys once in Settings → API Keys."
            cta="Add repository"
            onCta={() => router.push("/onboarding")}
          />
        ) : (
          <div>
            <p style={s.redirectNote}>Taking you to your repository…</p>
            <Button kind="primary" onClick={() => router.push(`/repos/${repos[0]!.id}/pulls`)}>
              Open {repos[0]!.full_name}
            </Button>
          </div>
        )}
      </PageContainer>
    </AppShell>
  );
}

export default HomeView;
