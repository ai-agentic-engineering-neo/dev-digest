/* LargePrBanner — i18n-free (strings as props) so /showcase can mount it. Spec: client/specs/smart-diff.md (C14) */
"use client";

import React from "react";
import { s } from "./styles";

export interface LargePrBannerProps {
  title: string;
  body: string;
}

export function LargePrBanner({ title, body }: LargePrBannerProps) {
  return (
    <div role="note" style={s.root}>
      <div style={s.title}>{title}</div>
      <div style={s.body}>{body}</div>
    </div>
  );
}

export default LargePrBanner;
