/**
 * Reasoning models reject (or silently ignore) a custom `temperature`:
 * OpenAI o-series (o1/o3/o4…) and GPT-5 family, DeepSeek R1 / deepseek-reasoner.
 * Matched on the model name after any `vendor/` prefix (OpenRouter slugs).
 */
const NO_TEMPERATURE = [/^o\d(?:$|[-.])/, /^gpt-5(?:$|[-.])/, /^deepseek-(?:reasoner|r1)(?:$|[-:.])/];

export function supportsTemperature(model: string): boolean {
  const name = model.slice(model.lastIndexOf('/') + 1).toLowerCase();
  return !NO_TEMPERATURE.some((re) => re.test(name));
}

/** `{ temperature }` only when the caller set one AND the model accepts it. */
export function temperatureParam(model: string, temperature: number | undefined): { temperature?: number } {
  return temperature === undefined || !supportsTemperature(model) ? {} : { temperature };
}
