/** Adapter barrel — real + mock implementations behind the adapter interfaces. */
export { LocalSecretsProvider } from './secrets/local.js';
export { LocalNoAuthProvider } from './auth/local.js';
export { OpenAIProvider } from './llm/openai.js';
export { AnthropicProvider } from './llm/anthropic.js';
export { OpenAIEmbedder } from './embedder/openai.js';
export { OctokitGitHubClient } from './github/octokit.js';
export { GitLabClient } from './gitlab/rest.js';
export { SimpleGitClient } from './git/simple-git.js';
export { parseUnifiedDiff } from './git/diff-parser.js';
export { RipgrepCodeIndex } from './codeindex/ripgrep.js';
export { estimateCost } from './llm/pricing.js';
export * from './mocks.js';
