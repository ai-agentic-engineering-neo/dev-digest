import type { Container } from '../../platform/container.js';
import { SkillImportService } from './application/import-service.js';
import { SkillsService } from './application/skills-service.js';
import { builtInCommunityCatalog } from './infrastructure/community-catalog.js';
import { GuardedFetcher } from './infrastructure/guarded-fetcher.js';
import { SkillsRepository } from './infrastructure/repository.js';
import { fflateArchiveReader } from './infrastructure/zip-reader.js';

/**
 * Composition root of the skills module (lazy: `Container.modules.skills`).
 * `service` = CRUD / versions / stats; `importer` = import preview + catalog.
 */
export function buildSkillsModule(c: Container) {
  return {
    service: new SkillsService({
      skills: new SkillsRepository(c.db),
      tx: c.transactionRunner((db) => ({ skills: new SkillsRepository(db) })),
      clock: () => new Date(),
    }),
    importer: new SkillImportService({
      archive: fflateArchiveReader,
      fetcher: new GuardedFetcher(),
      catalog: builtInCommunityCatalog,
    }),
  };
}
