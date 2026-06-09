import React from "react";

/** Skeleton loading bar (uses .skeleton from styles.css). */
export function Skeleton({
  width = "100%",
  height = 14,
  style,
}: {
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
}) {
  return <div className="skeleton" style={{ width, height, ...style }} />;
}
