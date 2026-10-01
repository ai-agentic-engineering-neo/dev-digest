// Ring 4. Shared zod field definitions for tool inputs (raw shapes, zod v3).
// Every field has .describe; ids are uuids and `repo` is "owner/name", so no
// URL or path fragment can come in through tool arguments.
import { z } from 'zod/v3';

export const repoField = z
  .string()
  .regex(/^[\w.-]+\/[\w.-]+$/, 'must look like "owner/name"')
  .describe('Repository full name as "owner/name", e.g. "acme/api".');

export const prField = z.number().int().positive().describe('Pull request number (positive integer), e.g. 42.');
