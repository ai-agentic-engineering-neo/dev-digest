import React from "react";

export function Card({
  children,
  pad = true,
  style,
  hover,
  onClick,
}: {
  children?: React.ReactNode;
  pad?: boolean;
  style?: React.CSSProperties;
  hover?: boolean;
  onClick?: () => void;
}) {
  const [h, setH] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hover && setH(true)}
      onMouseLeave={() => hover && setH(false)}
      style={{
        background: h ? "var(--bg-hover)" : "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: pad ? "var(--card-pad)" : 0,
        transition: "background .12s, border-color .12s",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
