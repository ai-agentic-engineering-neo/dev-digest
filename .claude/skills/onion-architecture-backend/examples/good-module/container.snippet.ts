// platform/container.ts (root) — the two additions a new module needs.
// The getter returns the PORT type, and tests can inject a fake through overrides.

import type { SkillsRepositoryPort } from '../modules/skills/ports.js';
import { SkillsRepository } from '../modules/skills/repository.js';

export interface ContainerOverrides {
  // …existing keys…
  skillsRepo?: SkillsRepositoryPort;
}

export class Container {
  // …existing members…
  private _skillsRepo?: SkillsRepositoryPort;

  get skillsRepo(): SkillsRepositoryPort {
    return (this._skillsRepo ??= this.overrides.skillsRepo ?? new SkillsRepository(this.db));
  }
}

// modules/index.ts — register the plugin in the static record:
//   import skills from './skills/routes.js';
//   export const modules = { …, skills };
