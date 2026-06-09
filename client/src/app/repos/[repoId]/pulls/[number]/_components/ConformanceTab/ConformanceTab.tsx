"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import ConformanceReport from "../../conformance/_components/ConformanceReport";

interface ConformanceTabProps {
  prId: string | null;
  prNumber: number;
}

export function ConformanceTab({ prId, prNumber }: ConformanceTabProps) {
  return (
    <section>
      <SectionLabel icon="ListChecks">PRD ↔ PR Conformance</SectionLabel>
      {prId && <ConformanceReport prId={prId} prNumber={prNumber} />}
    </section>
  );
}
