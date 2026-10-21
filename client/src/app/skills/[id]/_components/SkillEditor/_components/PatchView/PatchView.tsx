/* PatchView — renders a unified diff (server-produced) line by line. */
"use client";

import React from "react";
import { classifyPatch } from "./helpers";
import { s } from "./styles";

export function PatchView({ patch }: { patch: string }) {
  return (
    <div className="mono" style={s.box} data-testid="patch-view">
      {classifyPatch(patch).map((l, i) => (
        <span key={i} style={s.line(l.kind)}>
          {l.text || " "}
        </span>
      ))}
    </div>
  );
}
