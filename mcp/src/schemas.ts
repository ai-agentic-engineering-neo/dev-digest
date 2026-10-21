import { z } from 'zod';

/**
 * Input schema pieces shared by more than one tool, defined once so the enums
 * and the types derived from them cannot drift between tools and format.ts.
 */
export const RepoSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe('Repository name or owner/name, e.g. "acme/payments-api"');

export const ResponseFormatSchema = z.enum(['concise', 'detailed']);
export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;

export const MinSeveritySchema = z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']);
export type Severity = z.infer<typeof MinSeveritySchema>;
