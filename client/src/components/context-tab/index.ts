/* context-tab — the shared Context tab UI (specs/09-project-context-folder.md)
   used by both the agent editor and the skill editor. Public surface: the
   ContextTab component + its prop/namespace types. The agent- and
   skill-specific data-fetching stay in each editor's own thin wrapper
   (`AgentEditor/_components/ContextTab`, `SkillEditor/_components/ContextTab`)
   — see ContextTab.tsx's doc comment for why. */
export { ContextTab } from "./ContextTab";
export type { ContextTabNamespace, ContextTabProps } from "./ContextTab";
