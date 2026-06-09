import React from "react";
import { IconBtn } from "../primitives";

export function Drawer({
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
    <div style={{ position: "fixed", inset: 0, display: "flex", justifyContent: "flex-end", zIndex: 50 }}>
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", animation: "ddfadein .15s ease" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "relative",
          width,
          maxWidth: "94%",
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border-strong)",
          boxShadow: "var(--shadow-drawer)",
          display: "flex",
          flexDirection: "column",
          animation: "ddslidein .2s cubic-bezier(.2,.7,.3,1)",
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
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{subtitle}</div>
            )}
          </div>
          {onClose && <IconBtn icon="X" label="Close" onClick={onClose} />}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>{children}</div>
        {footer && (
          <div style={{ borderTop: "1px solid var(--border)", padding: "16px 24px", background: "var(--bg-primary)" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
