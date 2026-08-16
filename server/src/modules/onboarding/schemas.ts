import { z } from 'zod';
import { CRITICAL_PATHS_MAX, FIRST_TASKS_MAX, READING_PATH_MAX, SETUP_STEPS_MAX } from './constants.js';

/**
 * The LLM-facing extraction schema for the one structured call — a SEPARATE
 * raw shape, narrower/different than the DB-shaped `Onboarding` contract
 * (Q3, decided). Mirrors `conventions/schemas.ts`'s stated principle: the
 * model never assigns what's computed server-side (order, chain hops, grounded
 * status) — it only supplies title/body/reason/diagram text.
 */

const RawEntry = z.object({
  path: z.string().min(1).max(500),
  reason: z.string().min(1).max(400).optional(),
});

const RawStep = z.object({
  command: z.string().min(1).max(200),
  reason: z.string().min(1).max(400).optional(),
});

const RawTask = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  files: z.array(z.string().min(1).max(500)).min(1).max(10),
});

export const OnboardingGenerationOutput = z.object({
  architecture: z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(4000),
    diagram: z.string().max(4000).optional(),
  }),
  critical_paths: z.object({
    title: z.string().min(1).max(200),
    intro: z.string().max(1000).optional(),
    entries: z.array(RawEntry).max(CRITICAL_PATHS_MAX),
  }),
  run_locally: z.object({
    title: z.string().min(1).max(200),
    intro: z.string().max(1000).optional(),
    steps: z.array(RawStep).max(SETUP_STEPS_MAX),
  }),
  reading_path: z.object({
    title: z.string().min(1).max(200),
    intro: z.string().max(1000).optional(),
    entries: z.array(RawEntry).max(READING_PATH_MAX),
  }),
  first_tasks: z.object({
    title: z.string().min(1).max(200),
    intro: z.string().max(1000).optional(),
    tasks: z.array(RawTask).max(FIRST_TASKS_MAX),
  }),
});
export type OnboardingGenerationOutput = z.infer<typeof OnboardingGenerationOutput>;
