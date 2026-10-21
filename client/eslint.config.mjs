// ESLint flat config for the web app — TypeScript-aware, no type-checked rules.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// Cross-folder imports into src/lib or src/components use the `@/` alias, not a
// climbing relative path (react-frontend-architecture › Module boundaries).
// Turned into a lint rule on 2026-10-06 so the architecture review no longer
// has to find it by reading. Files listed in LEGACY_DEEP_RELATIVE predate the
// rule (Next.js [segment] brackets are escaped: `files` is a glob); they are a frozen baseline, like server/.dependency-cruiser-known-violations.json.
// Remove a file from the list when you convert it; never add one.
const DEEP_RELATIVE_IMPORT = {
  regex: "^(\\.\\./){2,}(.*/)?(lib|components)/",
  message: "Import from src/lib or src/components with the @/ alias (e.g. @/lib/hooks/reviews), not a deep relative path.",
};
const LEGACY_DEEP_RELATIVE = [
  "src/app/agents/_components/AgentCard/AgentCard.tsx",
  "src/app/agents/_components/AgentsListView/AgentsListView.tsx",
  "src/app/agents/_components/AgentsListView/_components/CreateAgentModal/CreateAgentModal.tsx",
  "src/app/agents/\\[id\\]/_components/AgentEditor/AgentEditor.test.tsx",
  "src/app/agents/\\[id\\]/_components/AgentEditor/_components/ConfigTab/ConfigTab.tsx",
  "src/app/agents/\\[id\\]/_components/AgentEditor/_components/SkillsTab/SkillsTab.test.tsx",
  "src/app/agents/\\[id\\]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx",
  "src/app/agents/\\[id\\]/page.tsx",
  "src/app/conventions/_components/CandidateCard/CandidateCard.tsx",
  "src/app/conventions/_components/ConventionsView/_components/CreateSkillModal/CreateSkillModal.test.tsx",
  "src/app/conventions/_components/ConventionsView/_components/CreateSkillModal/CreateSkillModal.tsx",
  "src/app/conventions/_components/ConventionsView/ConventionsView.tsx",
  "src/app/repos/\\[repoId\\]/pulls/constants.ts",
  "src/app/repos/\\[repoId\\]/pulls/helpers.ts",
  "src/app/repos/\\[repoId\\]/pulls/\\[number\\]/_components/FindingCard/FindingCard.tsx",
  "src/app/repos/\\[repoId\\]/pulls/\\[number\\]/_components/FindingsPanel/FindingsPanel.tsx",
  "src/app/repos/\\[repoId\\]/pulls/\\[number\\]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx",
  "src/app/repos/\\[repoId\\]/pulls/\\[number\\]/_components/RunReviewDropdown/RunReviewDropdown.tsx",
  "src/app/repos/\\[repoId\\]/pulls/\\[number\\]/_components/RunStatus/RunStatus.tsx",
  "src/app/repos/\\[repoId\\]/pulls/\\[number\\]/page.tsx",
  "src/app/settings/\\[section\\]/_components/SettingsView/_components/SettingsApiKeys/constants.ts",
  "src/app/settings/\\[section\\]/_components/SettingsView/_components/SettingsApiKeys/SettingsApiKeys.tsx",
  "src/app/settings/\\[section\\]/_components/SettingsView/_components/SettingsModels/SettingsModels.tsx",
  "src/app/settings/\\[section\\]/_components/SettingsView/SettingsView.tsx",
  "src/app/skills/_components/SkillCard/SkillCard.tsx",
  "src/app/skills/_components/SkillForm/constants.ts",
  "src/app/skills/_components/SkillPanel/SkillPanel.test.tsx",
  "src/app/skills/_components/SkillPanel/SkillPanel.tsx",
  "src/app/skills/_components/SkillsView/_components/CreateSkillModal/CreateSkillModal.tsx",
  "src/app/skills/_components/SkillsView/_components/ImportSkillDrawer/ImportSkillDrawer.test.tsx",
  "src/app/skills/_components/SkillsView/_components/ImportSkillDrawer/ImportSkillDrawer.tsx",
  "src/app/skills/_components/SkillsView/SkillsView.test.tsx",
  "src/app/skills/_components/SkillsView/SkillsView.tsx",
  "src/app/skills/\\[id\\]/_components/SkillEditor/_components/ConfigTab/ConfigTab.tsx",
  "src/app/skills/\\[id\\]/_components/SkillEditor/_components/VersioningTab/VersioningTab.test.tsx",
  "src/app/skills/\\[id\\]/_components/SkillEditor/_components/VersioningTab/VersioningTab.tsx",
  "src/app/skills/\\[id\\]/_components/SkillEditor/SkillEditor.tsx",
  "src/components/app-shell/helpers.ts",
  "src/components/app-shell/hooks/useGlobalShortcuts.ts",
  "src/components/app-shell/hooks/useShellCommands.ts",
  "src/components/app-shell/hooks/useShellContext.ts",
  "src/components/diff-viewer/comments.ts",
];

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "src/vendor/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mjs}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node, React: "readonly" } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Hydration-safe reads (theme, active repo, localStorage) legitimately
      // sync state inside effects here; keep the signal without failing lint.
      "react-hooks/set-state-in-effect": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-restricted-imports": ["error", { patterns: [DEEP_RELATIVE_IMPORT] }],
    },
  },
  { files: LEGACY_DEEP_RELATIVE, rules: { "no-restricted-imports": "off" } },
);
