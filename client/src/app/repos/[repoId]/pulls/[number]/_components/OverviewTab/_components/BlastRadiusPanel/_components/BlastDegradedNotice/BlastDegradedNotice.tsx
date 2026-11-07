import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { BlastDegradedReason } from "@/lib/types";
import { s } from "./styles";

export function BlastDegradedNotice({
  reason,
  onResync,
  resyncing,
  timedOut,
}: {
  reason: BlastDegradedReason;
  onResync?: () => void;
  resyncing: boolean;
  timedOut: boolean;
}) {
  const t = useTranslations("blast");
  return (
    <div role="status" style={s.box}>
      <div style={s.head}>
        <Icon.AlertTriangle size={16} aria-hidden />
        <p style={s.text}>{t(`degraded.${reason}`)}</p>
      </div>
      {onResync ? (
        <>
          <p style={s.hint}>{t("resync.hint")}</p>
          <div style={s.actions}>
            <Button kind="secondary" size="sm" icon="RefreshCw" loading={resyncing} disabled={resyncing} onClick={onResync}>
              {resyncing ? t("resync.running") : t("resync.button")}
            </Button>
          </div>
        </>
      ) : null}
      {timedOut ? <p style={s.hint}>{t("resync.timeout")}</p> : null}
    </div>
  );
}
