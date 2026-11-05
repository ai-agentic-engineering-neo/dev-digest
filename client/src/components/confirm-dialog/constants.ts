/** Width of the confirmation modal (design: compact "Delete skill" dialog). */
export const CONFIRM_DIALOG_WIDTH = 420;

/** Marks the Cancel button — focus returns to it after a failed confirm. */
export const CANCEL_SELECTOR = "[data-confirm-cancel]";

/** Enabled controls the focus trap cycles through. */
export const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
