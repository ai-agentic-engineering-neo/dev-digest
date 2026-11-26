/* ListDetail — master-detail shell: a fixed-width list column (header + scrolling
   body) on the left and the selected item's pane on the right. Shared by the
   Agent Editor and the Skills page. Emits no words of its own: every label comes
   from the caller (client/INSIGHTS.md "Keep shared src/components free of their
   own i18n namespace"). */
import React from "react";
import { s } from "./styles";

export interface ListDetailProps {
  /** Top of the list column (title, actions, search). Does not scroll. */
  listHeader?: React.ReactNode;
  /** The list itself (cards, skeletons, empty/error states). Scrolls. */
  list: React.ReactNode;
  /** Accessible name of the list column. */
  listLabel?: string;
  /** The right pane: the selected item, or a "select an item" prompt. */
  children: React.ReactNode;
}

export function ListDetail({ listHeader, list, listLabel, children }: ListDetailProps) {
  return (
    <div style={s.root}>
      <aside aria-label={listLabel} style={s.list}>
        {listHeader != null && <div style={s.listHeader}>{listHeader}</div>}
        <div style={s.listBody}>{list}</div>
      </aside>
      <section style={s.detail}>{children}</section>
    </div>
  );
}
