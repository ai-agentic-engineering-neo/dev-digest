import React from "react";
import { Icon, type IconName } from "../icons";
import { Button } from "./Button";

export function EmptyState({
  icon,
  title,
  body,
  cta,
  onCta,
  ctaLoading,
}: {
  icon?: IconName;
  title: string;
  body?: React.ReactNode;
  cta?: string;
  onCta?: () => void;
  ctaLoading?: boolean;
}) {
  const I = icon ? Icon[icon] : null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "60px 28px",
        gap: 8,
      }}
    >
      {I && (
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
            marginBottom: 8,
          }}
        >
          <I size={22} />
        </div>
      )}
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{title}</div>
      {body && (
        <div style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 340, lineHeight: 1.5 }}>
          {body}
        </div>
      )}
      {cta && (
        <div style={{ marginTop: 12 }}>
          <Button kind="secondary" icon="Plus" onClick={onCta} loading={ctaLoading}>
            {cta}
          </Button>
        </div>
      )}
    </div>
  );
}
