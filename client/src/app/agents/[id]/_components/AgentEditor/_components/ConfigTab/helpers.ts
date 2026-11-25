import type { Agent, CiFailOn, Provider, ReviewStrategy } from "@devdigest/shared";

/** Editable fields of the Config tab (camelCase local names). */
export interface AgentConfigForm {
  name: string;
  description: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  repoIntel: boolean;
  enabled: boolean;
}

/** Initial form values from the saved agent. */
export function formFromAgent(agent: Agent): AgentConfigForm {
  return {
    name: agent.name,
    description: agent.description,
    provider: agent.provider,
    model: agent.model,
    systemPrompt: agent.system_prompt,
    strategy: agent.strategy,
    ciFailOn: agent.ci_fail_on,
    repoIntel: agent.repo_intel,
    enabled: agent.enabled,
  };
}

/** Form values → the agent update patch (API field names). */
export function formToPatch(form: AgentConfigForm) {
  return {
    name: form.name,
    description: form.description,
    provider: form.provider,
    model: form.model,
    system_prompt: form.systemPrompt,
    strategy: form.strategy,
    ci_fail_on: form.ciFailOn,
    repo_intel: form.repoIntel,
    enabled: form.enabled,
  };
}
