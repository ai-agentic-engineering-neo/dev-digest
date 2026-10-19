import type { Container } from '../../platform/container.js';
import { ZipArchiveReader } from '../../adapters/archive/zip.js';
import { SkillsService } from './service.js';
import { SkillsRepository } from './repository.js';

export function createSkillsService(c: Container): SkillsService {
  return new SkillsService({
    store: new SkillsRepository(c.db),
    archive: new ZipArchiveReader(),
  });
}
