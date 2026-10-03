"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, FormField, TextInput } from "@devdigest/ui";
import { useTestConnection } from "../../../../../../../lib/hooks";
import { ApiError } from "../../../../../../../lib/api";
import type { ConnTestProvider } from "../../../../../../../lib/types";
import { s } from "./styles";

/**
 * Trivial presentational pieces used only by `SettingsApiKeys` — grouped here
 * per the `atoms.tsx` escape hatch rather than given their own folder+`index.ts`
 * each, since neither is tested or reused outside this parent.
 */

/** "Configured / Not set" pill driven by GET /settings/secrets-status. */
export function StatusBadge({ configured }: { configured: boolean | undefined }) {
  const t = useTranslations("settings");
  if (configured === undefined) return null; // status still loading
  return (
    <span style={s.badge(configured)}>
      <span style={s.badgeDot(configured)} />
      {configured ? t("apiKeys.configured") : t("apiKeys.notSet")}
    </span>
  );
}

export function KeyRow({
  label,
  provider,
  hint,
  configured,
}: {
  label: string;
  provider: ConnTestProvider;
  hint: string;
  configured: boolean | undefined;
}) {
  const t = useTranslations("settings");
  const [val, setVal] = React.useState("");
  const [reveal, setReveal] = React.useState(false);
  const test = useTestConnection();
  const [res, setRes] = React.useState<{ ok: boolean; message: string } | null>(null);

  const run = async () => {
    setRes(null);
    try {
      const r = await test.mutateAsync({ provider, key: val.trim() || undefined });
      setRes({ ok: r.ok, message: r.message });
    } catch (e) {
      setRes({ ok: false, message: e instanceof ApiError ? e.message : t("apiKeys.testFailed") });
    }
  };

  return (
    <FormField label={label} hint={hint} right={<StatusBadge configured={configured} />}>
      <div style={s.keyRow}>
        <div style={s.keyInput}>
          <TextInput
            value={val}
            onChange={setVal}
            mono
            type={reveal ? "text" : "password"}
            placeholder={t("apiKeys.placeholder")}
            suffix={
              <Icon.EyeOff size={14} style={s.revealIcon} onClick={() => setReveal((r) => !r)} />
            }
          />
        </div>
        <Button kind="secondary" size="md" onClick={run} disabled={test.isPending}>
          {test.isPending ? t("apiKeys.testing") : t("apiKeys.testConnection")}
        </Button>
      </div>
      {res && (
        <div style={s.result(res.ok)}>
          {res.ok ? <Icon.CheckCircle size={13} /> : <Icon.XCircle size={13} />}
          {res.message}
        </div>
      )}
    </FormField>
  );
}
