/**
 * Pure helpers for the skills a run attaches (server/specs/03-skills.md
 * Rules §5, §10): the Live Log line and finding attribution.
 */
import type { SkillUsed } from '@devdigest/shared';
import type { ReviewSkill } from './types.js';

/**
 * `skills: 3 attached (pr-quality-rubric v5, …) · ~N tokens`. When the review
 * may be split into map-reduce chunks, the note says the block repeats per chunk.
 */
export function skillsLogLine(skills: readonly ReviewSkill[], tokens: number, mayRepeatPerChunk: boolean): string {
  const names = skills.map((s) => `${s.name} v${s.version}`).join(', ');
  const repeat = mayRepeatPerChunk ? ' (repeated in every map-reduce chunk)' : '';
  return `skills: ${skills.length} attached (${names}) · ~${tokens} tokens${repeat}`;
}

/** `name → id` of the run's attached skills (what a finding's `skill` resolves against). */
export function skillIdsByName(skills: readonly ReviewSkill[]): Map<string, string> {
  return new Map(skills.map((s) => [s.name, s.id]));
}

/** The trace's `skills_used`: id, name and exact version, in prompt order. */
export function skillsUsed(skills: readonly ReviewSkill[]): SkillUsed[] {
  return skills.map((s) => ({ id: s.id, name: s.name, version: s.version }));
}
