import { type IconName } from "../icons";

export type Severity = "CRITICAL" | "WARNING" | "SUGGESTION" | "INFO";
export type Category = "bug" | "security" | "perf" | "style" | "test";

export const SEV: Record<
  Severity,
  { c: string; bg: string; icon: IconName; label: string }
> = {
  CRITICAL: { c: "var(--crit)", bg: "var(--crit-bg)", icon: "AlertOctagon", label: "Critical" },
  WARNING: { c: "var(--warn)", bg: "var(--warn-bg)", icon: "AlertTriangle", label: "Warning" },
  SUGGESTION: { c: "var(--sugg)", bg: "var(--sugg-bg)", icon: "Lightbulb", label: "Suggestion" },
  INFO: { c: "var(--info)", bg: "var(--info-bg)", icon: "Info", label: "Info" },
};

export const CAT: Record<Category, { icon: IconName; label: string }> = {
  bug: { icon: "Bug", label: "bug" },
  security: { icon: "Shield", label: "security" },
  perf: { icon: "Zap", label: "perf" },
  style: { icon: "Code", label: "style" },
  test: { icon: "FlaskConical", label: "test" },
};

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  kind?: "primary" | "secondary" | "tertiary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  iconRight?: IconName;
  active?: boolean;
  full?: boolean;
  /** Shows a spinning indicator and disables the button while a task runs. */
  loading?: boolean;
  children?: React.ReactNode;
}
