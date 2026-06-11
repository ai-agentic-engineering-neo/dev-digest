/**
 * A3 — onboarding generator constants.
 *
 * Redesigned: the tour is produced in ONE structured LLM call. We compute the
 * hard facts locally (see analyzer.ts) and let the model only write the
 * narrative; sections lean on what we can extract cheaply and deterministically.
 */
import type { Provider } from '@devdigest/shared';
import { renderPrompt } from '../../platform/prompts.js';

/** Output language for the generated tour. Both must be supported. */
export type OnboardingLang = 'en' | 'uk';
export const DEFAULT_LANG: OnboardingLang = 'en';

const LANGUAGE_NAME: Record<OnboardingLang, string> = {
  en: 'English',
  uk: 'Ukrainian (українська)',
};

/**
 * The fixed 5-section plan. `kind` is a free string in the contract; these are
 * chosen to match what the analyzer can ground well. `query` feeds the single
 * combined RAG retrieval.
 */
export const SECTION_PLAN: { kind: string; title: string; focus: string; query: string }[] = [
  {
    kind: 'overview',
    title: 'Overview',
    focus:
      'what this project is, its domain/purpose, how big it is, and its shape (frontend / Node backend / monorepo)',
    query: 'what does this project do, purpose, product vision, README',
  },
  {
    kind: 'tech_stack',
    title: 'Tech Stack',
    focus:
      'language, frameworks, key libraries, and which external services it talks to (inferred from dependencies)',
    query: 'dependencies, frameworks, database, services, configuration',
  },
  {
    kind: 'architecture',
    title: 'Architecture',
    focus:
      'how the folders map to layers and how the pieces fit together; include ONE mermaid diagram; point at key files',
    query: 'architecture, layers, modules, data flow, services, adapters, entry points',
  },
  {
    kind: 'routes_and_apis',
    title: 'Routes & APIs',
    focus:
      'the UI routes (if there is a frontend) and/or the backend HTTP API endpoints (if there is a backend)',
    query: 'routes, pages, api endpoints, controllers, handlers',
  },
  {
    kind: 'getting_started',
    title: 'Getting Started',
    focus:
      'how to install and run (from package scripts), required env vars, current test state, and where to start reading first',
    query: 'install, run, dev server, scripts, environment variables, setup, tests',
  },
];

/**
 * Default provider/model + retry budget for the single section-writing pass.
 * Runs on OpenRouter → DeepSeek V4 Flash: near-frontier quality at ~1/30th the
 * price of a flagship, with a 1M-token context that comfortably fits the
 * facts + file-tree + RAG context. Requires OPENROUTER_API_KEY (set it in
 * Settings or the env). Falls back to the deterministic skeleton on any error.
 */
export const ONBOARDING_PROVIDER: Provider = 'openrouter';
export const ONBOARDING_MODEL = 'deepseek/deepseek-v4-flash';
export const ONBOARDING_MAX_RETRIES = 1;

/**
 * System prompt for the single-call tour. The instruction text lives in the
 * editable template `src/prompts/onboarding.system.md`; here we only fill the
 * `{{sections}}` and `{{language}}` placeholders. Returned JSON is validated
 * against the `Onboarding` schema.
 */
export async function buildSystemPrompt(lang: OnboardingLang): Promise<string> {
  const sections = SECTION_PLAN.map(
    (s, i) => `${i + 1}. kind="${s.kind}" (title "${s.title}") — ${s.focus}.`,
  ).join('\n');
  return renderPrompt('onboarding.system.md', {
    sections,
    language: LANGUAGE_NAME[lang],
  });
}

// ---------------------------------------------------------------- analyzer maps

/** Frontend framework dependency markers (presence ⇒ has a UI). */
export const FRONTEND_DEPS = [
  'react', 'react-dom', 'next', 'vue', 'svelte', '@sveltejs/kit', 'nuxt',
  '@angular/core', 'solid-js', 'preact', '@remix-run/react',
];

/** Backend framework dependency markers (presence ⇒ has a server). */
export const BACKEND_DEPS = [
  'express', 'fastify', 'koa', '@nestjs/core', '@hapi/hapi', 'hapi', 'restify', 'polka', 'h3',
];

/** Fullstack frameworks that are both UI and server. */
export const FULLSTACK_DEPS = ['next', 'nuxt', '@remix-run/node', '@sveltejs/kit'];

/** dependency-name (substring) → external service label, for "talks to" facts. */
export const SERVICE_MAP: { match: string; label: string }[] = [
  { match: 'drizzle-orm', label: 'SQL DB (Drizzle ORM)' },
  { match: 'prisma', label: 'SQL DB (Prisma)' },
  { match: 'typeorm', label: 'SQL DB (TypeORM)' },
  { match: 'postgres', label: 'PostgreSQL' },
  { match: 'mysql2', label: 'MySQL' },
  { match: 'mongoose', label: 'MongoDB' },
  { match: 'mongodb', label: 'MongoDB' },
  { match: 'better-sqlite3', label: 'SQLite' },
  { match: 'ioredis', label: 'Redis' },
  { match: 'redis', label: 'Redis' },
  { match: 'openai', label: 'OpenAI / LLM' },
  { match: '@anthropic-ai/sdk', label: 'Anthropic / LLM' },
  { match: '@aws-sdk', label: 'AWS' },
  { match: 'aws-sdk', label: 'AWS' },
  { match: '@google-cloud', label: 'Google Cloud' },
  { match: 'googleapis', label: 'Google APIs' },
  { match: 'stripe', label: 'Stripe' },
  { match: 'kafkajs', label: 'Kafka' },
  { match: 'amqplib', label: 'RabbitMQ' },
  { match: '@elastic/elasticsearch', label: 'Elasticsearch' },
  { match: '@sentry', label: 'Sentry' },
  { match: 'octokit', label: 'GitHub API' },
  { match: '@octokit', label: 'GitHub API' },
  { match: 'twilio', label: 'Twilio' },
  { match: 'nodemailer', label: 'Email / SMTP' },
  { match: 'socket.io', label: 'WebSockets (socket.io)' },
  { match: '@apollo/server', label: 'GraphQL (Apollo)' },
  { match: 'graphql', label: 'GraphQL' },
];

// ---------------------------------------------------------------- analyzer caps

export const ANALYZER_MAX_FILES = 4000; // hard cap on the repo walk
export const KEY_FILE_MAX = 12; // how many key files to excerpt
export const KEY_FILE_EXCERPT_CHARS = 1500; // per key-file excerpt cap
export const MAX_ROUTES = 60; // frontend routes to list
export const MAX_API_ENDPOINTS = 80; // backend endpoints to list
export const MAX_WORKSPACE_PKGS = 30; // package.json files to parse

/** Code file extensions the analyzer scans for routes/endpoints. */
export const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** Matches `*.test.*` / `*.spec.*` files when counting tests. */
export const TEST_FILE_RE = /\.(test|spec)\.[tj]sx?$/;

/** Filenames (lowercased) treated as high-signal "key files". */
export const KEY_FILE_NAMES = new Set([
  'readme.md', 'package.json', 'tsconfig.json', 'docker-compose.yml', 'docker-compose.yaml',
  '.env.example', 'next.config.js', 'next.config.mjs', 'next.config.ts',
  'vite.config.ts', 'vite.config.js', 'drizzle.config.ts', 'nest-cli.json', 'svelte.config.js',
]);

// ---------------------------------------------------------------- RAG retrieval

export const RETRIEVE_TOP_K = 12; // combined retrieval budget (was 5 per-section)
export const KEYWORD_SCAN_LIMIT = 80;
export const MIN_TOKEN_LEN = 3;
export const MAX_QUERY_TOKENS = 12;

// ---------------------------------------------------------------- skeleton fallback

export const SKELETON_EXCERPT_CHARS = 400;
export const MAX_SECTION_LINKS = 4;
export const SKELETON_LINK_RE = /readme|index|architecture|package\.json|config/i;

// ---------------------------------------------------------------- file-tree walk

export const TREE_IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage']);
export const TREE_MAX_DEPTH = 2;
export const TREE_MAX_ENTRIES = 120;
export const TREE_MAX_FILE_BYTES = 2_000_000;
