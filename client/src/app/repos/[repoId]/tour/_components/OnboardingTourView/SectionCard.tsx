"use client";

import React from "react";
import { Icon, Markdown } from "@devdigest/ui";
import type { OnboardingSection } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { SECTION_ICON } from "./constants";
import { sectionAnchorId } from "./helpers";
import { RankedList } from "./RankedList";
import { s } from "./styles";

/**
 * One of the tour's five fixed sections (AC-16). `body` renders through the
 * product's existing sanitized markdown renderer (AC-41 — no raw HTML
 * markup) and `diagram` (architecture only, AC-17) through the existing
 * validated Mermaid renderer, which renders nothing for an invalid diagram
 * rather than an error (AC-42) — both primitives are reused as-is, untouched.
 * `entries` (critical_paths/reading_path) render via the shared `RankedList`.
 */
export function SectionCard({
  section,
  repoFullName,
  indexSha,
}: {
  section: OnboardingSection;
  repoFullName: string | null | undefined;
  indexSha: string;
}) {
  const I = Icon[SECTION_ICON[section.kind]];
  return (
    <section id={sectionAnchorId(section.kind)} style={s.section} aria-labelledby={`${sectionAnchorId(section.kind)}-h`}>
      <div style={s.sectionHead}>
        <I size={16} style={{ color: "var(--text-muted)" }} />
        <h2 id={`${sectionAnchorId(section.kind)}-h`} style={s.sectionTitle}>
          {section.title}
        </h2>
      </div>
      {section.body && (
        <div style={s.sectionBody}>
          <Markdown>{section.body}</Markdown>
        </div>
      )}
      {section.diagram && <MermaidDiagram chart={section.diagram} />}
      {section.entries && (
        <RankedList entries={section.entries} repoFullName={repoFullName} indexSha={indexSha} />
      )}
    </section>
  );
}
