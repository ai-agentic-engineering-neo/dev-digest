/**
 * Zod-free registry of the system LLM features whose model is selectable in
 * Settings. Kept apart from contracts/platform.ts (which re-exports it) so a
 * client route can import the registry without pulling zod into its bundle.
 */

/** LLM providers ('openrouter' uses the OpenAI-compatible API). */
export const PROVIDER_IDS = ['openai', 'anthropic', 'openrouter'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Stable ids of the selectable features. */
export const FEATURE_MODEL_IDS = [
  'onboarding',
  'review_intent',
  'risk_brief',
  'conformance',
  'conventions',
] as const;
export type FeatureModelKey = (typeof FEATURE_MODEL_IDS)[number];

/**
 * Registry entry: stable id, display label, and the built-in default used when
 * the workspace hasn't overridden the choice. The defaults MIRROR each module's
 * constants, so behaviour is unchanged until a model is explicitly picked.
 */
export interface FeatureModelDef {
  id: FeatureModelKey;
  label: string;
  description: string;
  defaultProvider: ProviderId;
  defaultModel: string;
}

export const FEATURE_MODELS: FeatureModelDef[] = [
  {
    id: 'onboarding',
    label: 'Onboarding Tour',
    description: 'Writes the per-repo onboarding tour.',
    defaultProvider: 'openrouter',
    defaultModel: 'deepseek/deepseek-v4-flash',
  },
  {
    id: 'review_intent',
    label: 'PR Review · Intent',
    description: 'Derives a PR’s intent and scope before review.',
    defaultProvider: 'openrouter',
    defaultModel: 'deepseek/deepseek-v4-flash',
  },
  {
    id: 'risk_brief',
    label: 'Risk Brief',
    description: 'Assesses merge risks for a pull request.',
    defaultProvider: 'openai',
    defaultModel: 'gpt-4.1',
  },
  {
    id: 'conformance',
    label: 'Conformance',
    description: 'Checks a PR against the project spec.',
    defaultProvider: 'openai',
    defaultModel: 'gpt-4.1',
  },
  {
    id: 'conventions',
    label: 'Conventions',
    description: 'Extracts coding conventions from the repo.',
    defaultProvider: 'openai',
    defaultModel: 'gpt-5.4',
  },
];
