import { type IconName } from "../icons";

export type TabDef = string | { key: string; label: string; icon?: IconName; count?: number };

export interface DropdownItemDef {
  label?: string;
  icon?: IconName;
  hint?: string;
  muted?: boolean;
  divider?: boolean;
  onClick?: () => void;
  /** Optional trailing remove (trash) action shown on the right of the row. */
  onRemove?: () => void;
  /** Accessible label/tooltip for the trailing remove action. */
  removeLabel?: string;
  /**
   * specs/13-multi-agent-review.md §8 — when present, the row renders as a
   * multi-select row: a checkbox indicator plus `role="menuitemcheckbox"` +
   * `aria-checked`, instead of the default single-select row. Additive and
   * optional — a row with neither `checked` nor `keepOpen` behaves exactly as
   * it did before this field existed.
   */
  checked?: boolean;
  /** When true, activating this row does not close the menu (multi-select). */
  keepOpen?: boolean;
}
