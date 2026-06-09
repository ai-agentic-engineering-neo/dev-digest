import React from "react";

export function MonoLink({
  children,
  onClick,
}: {
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  const [h, setH] = React.useState(false);
  return (
    <button
      className="mono"
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        fontSize: 13,
        cursor: "pointer",
        color: h ? "var(--accent-text)" : "var(--text-secondary)",
        textDecoration: h ? "underline" : "none",
        textUnderlineOffset: 2,
      }}
    >
      {children}
    </button>
  );
}
