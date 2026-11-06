"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentPanel } from "./_components/IntentPanel";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoFullName: string | null;
}

export function OverviewTab({ prId, prBody, repoFullName }: OverviewTabProps) {
  return (
    <>
      {prId && <IntentPanel prId={prId} repoFullName={repoFullName} />}
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
