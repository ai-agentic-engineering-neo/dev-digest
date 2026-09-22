/* model-defaults.ts — client-side model defaults for user-created agents.
   The shared contracts define defaults only for system features
   (FEATURE_MODELS in @devdigest/shared); agents have none there, so the
   provider/model a new agent starts with lives here, once. */
import type { Provider } from "@devdigest/shared";

/** Provider a newly created agent starts with. */
export const DEFAULT_AGENT_PROVIDER: Provider = "openai";

/** Model a newly created agent starts with. */
export const DEFAULT_AGENT_MODEL = "gpt-4.1";
