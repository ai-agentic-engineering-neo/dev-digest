import type { IconName } from "@devdigest/ui";
import type { Verdict } from "@devdigest/shared";

/** Per-verdict visual meta. `labelKey` resolves under the `verdict` namespace. */
export const VERDICT_META: Record<
  Verdict,
  { c: string; bg: string; icon: IconName; labelKey: string }
> = {
  request_changes: {
    c: "var(--crit)",
    bg: "var(--crit-bg)",
    icon: "XCircle",
    labelKey: "requestChanges",
  },
  approve: { c: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle", labelKey: "approve" },
  // Amber, not gray: "comment" is the warning-only outcome (findings exist, but
  // none of them block). This is also VerdictBanner's fallback for an
  // unrecognized verdict, so that neutral fallback reads amber too — deliberate.
  // Both `c` AND `bg` move, otherwise an amber icon sits in a gray-tinted box.
  comment: { c: "var(--warn)", bg: "var(--warn-bg)", icon: "MessageSquare", labelKey: "comment" },
};
