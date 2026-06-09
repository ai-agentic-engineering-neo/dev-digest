import React from "react";
import type { LinkLike } from "./types";

/** Fallback Link used when no router <Link> is provided via ShellContext. */
export const DefaultLink: LinkLike = ({ href, children, style, onClick }) => (
  <a href={href} style={style} onClick={onClick}>
    {children}
  </a>
);
