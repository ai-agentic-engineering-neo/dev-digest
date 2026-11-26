import React from "react";
import { Icon } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPE_STYLE } from "./constants";

/** Type-coloured icon tile used on skill cards and in the detail header. */
export function SkillTypeIcon({ type, size = 26 }: { type: SkillType; size?: number }) {
  const style = SKILL_TYPE_STYLE[type];
  const I = Icon[style.icon];
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 7,
        background: style.bg,
        color: style.color,
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
      }}
    >
      <I size={Math.round(size * 0.58)} />
    </span>
  );
}
