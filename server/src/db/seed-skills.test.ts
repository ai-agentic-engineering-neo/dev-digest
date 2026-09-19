import { describe, it, expect } from 'vitest';
import { API_CONTRACT_REVIEWER_PROMPT } from './seed-prompts.js';
import {
  API_CONTRACT_SKILL_BODIES,
  BREAKING_CHANGE_BODY,
  RESPONSE_SCHEMA_BODY,
  SEMVER_DISCIPLINE_BODY,
} from './seed-skills.js';

describe('API Contract seed skill bodies', () => {
  it('each body has Good and Bad headings plus a flag instruction', () => {
    expect(API_CONTRACT_SKILL_BODIES).toHaveLength(3);
    for (const body of API_CONTRACT_SKILL_BODIES) {
      expect(body).toMatch(/## Good/i);
      expect(body).toMatch(/## Bad/i);
      expect(body).toMatch(/^# /);
      expect(body.toLowerCase()).toMatch(/flag/);
    }
  });

  it('breaking-change names a public-field rename', () => {
    expect(BREAKING_CHANGE_BODY).toMatch(/userId/);
    expect(BREAKING_CHANGE_BODY).toMatch(/user_id/);
    expect(BREAKING_CHANGE_BODY.toLowerCase()).toMatch(/public/);
  });

  it('response-schema names type, nullability, or requiredness', () => {
    expect(RESPONSE_SCHEMA_BODY).toMatch(/null|required|optional|type/i);
  });

  it('semver-discipline names a major bump', () => {
    expect(SEMVER_DISCIPLINE_BODY).toMatch(/major/i);
  });
});

describe('API Contract reviewer prompt conventions', () => {
  it('has severity, verdict mapping, and no JSON schema example', () => {
    expect(API_CONTRACT_REVIEWER_PROMPT).toMatch(/CRITICAL/);
    expect(API_CONTRACT_REVIEWER_PROMPT).toMatch(/WARNING/);
    expect(API_CONTRACT_REVIEWER_PROMPT).toMatch(/SUGGESTION/);
    expect(API_CONTRACT_REVIEWER_PROMPT).toMatch(/request_changes/);
    expect(API_CONTRACT_REVIEWER_PROMPT).toMatch(/[Nn]o findings/);
    expect(API_CONTRACT_REVIEWER_PROMPT).not.toMatch(/json_schema/);
    expect(API_CONTRACT_REVIEWER_PROMPT).not.toMatch(/\{ verdict/);
  });
});
