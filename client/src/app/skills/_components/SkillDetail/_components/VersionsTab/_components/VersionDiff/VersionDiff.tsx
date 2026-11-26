/* VersionDiff — inline line diff of one version against the previous one
   (computed on the client, no diff lib). Rendered inside the expanded row. */
"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { lineDiff } from "../../helpers";
import { DIFF_PREFIX } from "./constants";
import { s } from "./styles";

export function VersionDiff({
  id,
  fromVersion,
  fromBody,
  toVersion,
  toBody,
}: {
  /** Id of the region, referenced by the Diff button's `aria-controls`. */
  id: string;
  fromVersion: number;
  fromBody: string;
  toVersion: number;
  toBody: string;
}) {
  const t = useTranslations("skills.versions");
  // O(n·m) LCS: memoized so unrelated parent re-renders don't recompute it.
  const lines = useMemo(() => lineDiff(fromBody, toBody), [fromBody, toBody]);
  const hasChanges = lines.some((line) => line.kind !== "same");

  return (
    <div id={id} role="region" aria-label={t("diffCaption", { from: fromVersion, to: toVersion })} style={s.wrap}>
      {hasChanges ? (
        <pre className="mono" style={s.diff}>
          {lines.map((line, index) => (
            // Diff lines have no identity beyond their position; the list is never reordered.
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} data-kind={line.kind} style={s.line(line.kind)}>
              <span aria-hidden style={s.prefix}>
                {DIFF_PREFIX[line.kind]}
              </span>
              {line.text || " "}
            </div>
          ))}
        </pre>
      ) : (
        <p style={s.noChanges}>{t("noChanges")}</p>
      )}
    </div>
  );
}
