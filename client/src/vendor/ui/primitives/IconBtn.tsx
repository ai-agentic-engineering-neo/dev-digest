import React from "react";
import { Icon, type IconName } from "../icons";

export function IconBtn({
  icon,
  label,
  size = 30,
  active,
  onClick,
  danger,
  disabled,
}: {
  icon: IconName;
  label: string;
  size?: number;
  active?: boolean;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const I = Icon[icon];
  const [h, setH] = React.useState(false);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: size,
        height: size,
        display: "inline-grid",
        placeItems: "center",
        borderRadius: 6,
        border: "1px solid transparent",
        background: h && !disabled ? "var(--bg-hover)" : active ? "var(--bg-hover)" : "transparent",
        color:
          danger && h ? "var(--crit)" : active || h ? "var(--text-primary)" : "var(--text-secondary)",
        transition: "background .12s, color .12s",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <I size={Math.round(size * 0.52)} />
    </button>
  );
}
