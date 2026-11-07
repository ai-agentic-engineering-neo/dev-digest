import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { BlastCounts } from "@/lib/types";
import { s } from "./styles";

export function BlastSummary({ counts }: { counts: BlastCounts }) {
  const t = useTranslations("blast");
  return (
    <div role="group" aria-label={t("summary.ariaLabel")} style={s.row}>
      <Badge icon="Code">{t("summary.symbols", { count: counts.symbols })}</Badge>
      <Badge icon="CornerDownRight">{t("summary.callers", { count: counts.callers })}</Badge>
      <Badge icon="Globe">{t("summary.endpoints", { count: counts.endpoints })}</Badge>
      <Badge icon="Clock">{t("summary.crons", { count: counts.crons })}</Badge>
    </div>
  );
}
