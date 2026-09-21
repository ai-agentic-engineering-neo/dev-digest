/** DOM anchor id for a section — shared by `TourToc`'s links and each
 *  `SectionCard`'s heading, so a ToC click actually scrolls to something. */
export function sectionAnchorId(kind: string): string {
  return `tour-section-${kind}`;
}

// `relativeTime` moved to `@/lib/format` — a third real consumer
// (`PrBriefCard`'s provenance line) arrived, so it's promoted per this
// file's own former note ("promote on the second/third use").
export { relativeTime } from "@/lib/format";
