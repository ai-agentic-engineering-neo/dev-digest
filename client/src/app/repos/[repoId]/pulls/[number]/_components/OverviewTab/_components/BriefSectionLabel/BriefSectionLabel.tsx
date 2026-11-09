import type { ReactNode } from "react";
import { Badge, Icon, type IconName } from "@devdigest/ui";
import { s } from "./styles";

/** Section heading of the brief: icon + uppercase label, optional count badge. */
export function BriefSectionLabel({
  icon,
  id,
  count,
  children,
}: {
  icon: IconName;
  id?: string;
  count?: number;
  children: ReactNode;
}) {
  const I = Icon[icon];
  return (
    <h3 id={id} style={s.root}>
      <I size={14} aria-hidden style={s.icon} />
      <span style={s.text}>{children}</span>
      {count !== undefined && <Badge>{count}</Badge>}
    </h3>
  );
}
