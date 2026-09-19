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
   * Renders arbitrary content in place of the default label row (e.g. a
   * checkbox list) without auto-closing the menu on click. When set, all
   * other fields on this item are ignored. Call `close()` to dismiss the
   * menu once the custom content's own action fires.
   */
  custom?: (close: () => void) => React.ReactNode;
}
