import React from "react";
import { Icon } from "../icons";
import { Button } from "./Button";

/** Full-screen / inline error (spec §11 error UX taxonomy) with Retry. */
export function ErrorState({
  title = "Something went wrong",
  body,
  onRetry,
  fullScreen,
}: {
  title?: string;
  body?: React.ReactNode;
  onRetry?: () => void;
  fullScreen?: boolean;
}) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 10,
        padding: fullScreen ? "80px 24px" : "40px 24px",
        minHeight: fullScreen ? "60vh" : undefined,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
          background: "var(--crit-bg)",
          color: "var(--crit)",
          marginBottom: 5,
        }}
      >
        <Icon.AlertOctagon size={22} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{title}</div>
      {body && (
        <div style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 380, lineHeight: 1.5 }}>
          {body}
        </div>
      )}
      {onRetry && (
        <div style={{ marginTop: 12 }}>
          <Button kind="secondary" icon="RefreshCw" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
