import React from "react";
import { IconBtn } from "../primitives";

export function Modal({
  width = 720,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  width?: number;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose?: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", zIndex: 50, padding: 28 }}>
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", animation: "ddfadein .15s ease" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "relative",
          width,
          maxWidth: "100%",
          maxHeight: "92%",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          borderRadius: 14,
          boxShadow: "var(--shadow-modal)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "ddpop .18s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            padding: "18px 24px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{subtitle}</div>
            )}
          </div>
          {onClose && <IconBtn icon="X" label="Close" onClick={onClose} />}
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>{children}</div>
        {footer && (
          <div style={{ borderTop: "1px solid var(--border)", padding: "16px 24px", background: "var(--bg-surface)" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
