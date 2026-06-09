"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { SmartDiffViewer } from "../SmartDiffViewer";
import { DiffViewer } from "@/components/diff-viewer";
import type { SmartDiff, PrFile } from "@devdigest/shared";

interface DiffTabProps {
  filesCount: number;
  files: PrFile[];
  smartDiff: SmartDiff | null | undefined;
}

export function DiffTab({ filesCount, files, smartDiff }: DiffTabProps) {
  return (
    <section>
      <SectionLabel icon="Code">
        Files changed · {filesCount} files{smartDiff ? " · Smart Diff (grouped by role)" : ""}
      </SectionLabel>
      {smartDiff && smartDiff.groups.length > 0 ? (
        <SmartDiffViewer smartDiff={smartDiff} files={files} />
      ) : (
        <DiffViewer files={files} />
      )}
    </section>
  );
}
