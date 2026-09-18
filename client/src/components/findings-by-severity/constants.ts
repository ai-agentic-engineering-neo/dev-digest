import type { Severity } from "@devdigest/shared";

/** Display + sort order for the three real severities. */
export const SEVERITY_ORDER: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** How long the popover stays open after the mouse leaves both the trigger
 *  and the panel, before closing — bridges the DOM gap a portal introduces. */
export const CLOSE_DELAY_MS = 150;
