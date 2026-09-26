/**
 * Skill name/body limits shared by every module that accepts a skill from the
 * outside (skills CRUD, conventions extractor). Lives in `_shared` because
 * modules must not import each other (onion rule 6).
 */
import { z } from 'zod';

/** Skill names are kebab-case slugs (`pr-quality-rubric`), unique per workspace. */
export const MAX_NAME_CHARS = 64;
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Upper bound on a skill body; larger bodies blow the prompt budget. */
export const MAX_BODY_CHARS = 50_000;

export const SkillNameSchema = z
  .string()
  .min(1)
  .max(MAX_NAME_CHARS)
  .regex(SKILL_NAME_PATTERN, 'Skill name must be a kebab-case slug, e.g. pr-quality-rubric');

export const SkillBodySchema = z.string().min(1).max(MAX_BODY_CHARS);
