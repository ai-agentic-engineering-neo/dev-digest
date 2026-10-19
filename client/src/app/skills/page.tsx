/* Route: /skills — two-pane Skills screen. With skills it opens the first one
   in the editor; without, the right pane is the "No skills yet" empty state. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@devdigest/ui";
import { useSkills } from "../../lib/hooks/skills";
import { SkillsEmptyState, SkillsWorkspace } from "./_components/SkillsWorkspace";

export default function SkillsPage() {
  const router = useRouter();
  const { data: skills, isLoading } = useSkills();
  const first = skills?.[0];

  React.useEffect(() => {
    if (first) router.replace(`/skills/${first.id}?tab=config`);
  }, [first, router]);

  return (
    <SkillsWorkspace>
      {isLoading || first ? (
        <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton height={24} width={240} />
          <Skeleton height={200} />
        </div>
      ) : (
        <SkillsEmptyState />
      )}
    </SkillsWorkspace>
  );
}
