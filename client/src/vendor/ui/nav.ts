/* nav.ts — sidebar nav groups + keyboard shortcut registry.
   hrefs use :repoId token; the web app fills it from the active repo. */
import type { IconName } from "./icons";

export interface NavItemDef {
  key: string;
  label: string;
  icon: IconName;
  /** Route template; :repoId is replaced with the active repo id by the app. */
  href: string;
  /** Optional g-nav shortcut suffix (e.g. "p" → g then p). */
  gKey?: string;
  badge?: string;
}

export interface NavGroup {
  section: string;
  items: NavItemDef[];
}

export const NAV: NavGroup[] = [
  {
    section: "WORKSPACE",
    items: [
      { key: "pulls", label: "Pull Requests", icon: "GitPullRequest", href: "/repos/:repoId/pulls", gKey: "p" },
      {
        key: "context",
        label: "Project Context",
        icon: "FileText",
        href: "/repos/:repoId/context",
        gKey: "x",
      },
      {
        // specs/10-onboarding-generator.md — D10/AC-39: the route is
        // /repos/:repoId/tour, no "onboarding" URL segment anywhere.
        key: "onboarding-tour",
        label: "Onboarding Tour",
        icon: "Workflow",
        href: "/repos/:repoId/tour",
        gKey: "t",
      },
    ],
  },
  {
    // Skills (L02) are reusable, and Agents are what link and order them —
    // grouped together so the relationship reads directly off the sidebar.
    // Conventions turns detected repo patterns into skills; Eval Dashboard
    // (L06) is workspace-scoped like Skills/Agents, not repo-scoped.
    section: "SKILLS LAB",
    items: [
      { key: "skills", label: "Skills", icon: "Sparkles", href: "/skills", gKey: "s" },
      { key: "agents", label: "Agents", icon: "Cpu", href: "/agents", gKey: "a" },
      {
        key: "conventions",
        label: "Conventions",
        icon: "ListChecks",
        href: "/repos/:repoId/conventions",
        gKey: "c",
      },
      { key: "eval", label: "Eval Dashboard", icon: "BarChart3", href: "/eval", gKey: "e" },
    ],
  },
];

export const SETTINGS_ITEM: NavItemDef = {
  key: "settings",
  label: "Settings",
  icon: "Settings",
  href: "/settings/api-keys",
  gKey: ",",
};

export const SETTINGS_SECTIONS = [
  { key: "api-keys", label: "API Keys" },
  { key: "models", label: "Feature Models" },
] as const;

/** Keyboard shortcut registry. Wiring is finalized by A6. */
export interface ShortcutDef {
  keys: string;
  label: string;
  group: "Navigation" | "Findings" | "Actions" | "Global";
}

export const SHORTCUTS: ShortcutDef[] = [
  { keys: "⌘K", label: "Open command palette", group: "Global" },
  { keys: "?", label: "Show keyboard shortcuts", group: "Global" },
  { keys: "g p", label: "Go to Pull Requests", group: "Navigation" },
  { keys: "g x", label: "Go to Project Context", group: "Navigation" },
  { keys: "g t", label: "Go to Onboarding Tour", group: "Navigation" },
  { keys: "g s", label: "Go to Skills", group: "Navigation" },
  { keys: "g a", label: "Go to Agents", group: "Navigation" },
  { keys: "g c", label: "Go to Conventions", group: "Navigation" },
  { keys: "g e", label: "Go to Eval Dashboard", group: "Navigation" },
  { keys: "j / k", label: "Next / previous finding", group: "Findings" },
  { keys: "a", label: "Accept finding", group: "Findings" },
  { keys: "d", label: "Dismiss finding", group: "Findings" },
];

/** Resolve an :repoId-templated href against the active repo id. */
export function resolveHref(href: string, repoId: string | null | undefined): string {
  if (!href.includes(":repoId")) return href;
  return href.replace(":repoId", repoId ?? "_");
}
