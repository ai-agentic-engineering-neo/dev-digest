import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { SkillSource, SkillType } from "@devdigest/shared";
import { getContext } from "../_shared/context.js";
import { IdParams } from "../_shared/schemas.js";
import { NotFoundError, ValidationError } from "../../platform/errors.js";
import { fetchPublicUrl, BlockedHostError } from "../../platform/public-fetch.js";
import { SkillsService } from "./service.js";
import { regexScan, llmScan, THREAT_LEVEL } from "./scanner.js";
import type { ThreatLevel } from "./scanner.js";

/**
 * A1 — skills module routes.
 *   GET    /skills                  → list (workspace-scoped)
 *   GET    /skills/:id              → one skill
 *   POST   /skills                  → create (201)
 *   POST   /skills/import           → import from external source (201)
 *   PUT    /skills/:id              → update / toggle enabled (versions body)
 *   DELETE /skills/:id              → delete → { ok: true }
 *   GET    /skills/:id/stats        → skill stats
 *   GET    /skills/:id/versions     → version history
 *   POST   /skills/:id/restore      → restore body from historical version (201)
 *
 * NOTE: /skills/import and /:id/stats, /:id/versions, /:id/restore are registered
 * BEFORE the plain /:id routes so Fastify does not treat "import" as a uuid param.
 */

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  type: SkillType,
  body: z.string().min(1),
  source: SkillSource.optional(),
  enabled: z.boolean().optional(),
});

const ImportSkillBody = z.object({
  name: z.string().min(1),
  body: z.string().min(1),
  source: SkillSource.optional(),
  description: z.string().optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().optional(),
  enabled: z.boolean().optional(),
});

const RestoreBody = z.object({ version: z.number().int().min(1) });

const ImportUrlBody = z.object({
  url: z.string().url(),
  name: z.string().min(1),
  source: SkillSource.optional(),
  description: z.string().optional(),
});

/**
 * Безпечний fetch URL для імпорту скіла.
 * Захист від: SSRF, великих файлів, таймаутів, бінарників, HTTP downgrade.
 */
async function safeFetchSkillUrl(url: string): Promise<string> {
  if (!url.startsWith("https://")) {
    throw new ValidationError("Only HTTPS URLs are allowed");
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new ValidationError("Invalid URL");
  }

  const PRIVATE_IP =
    /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/;
  if (PRIVATE_IP.test(hostname)) {
    throw new ValidationError("Private and local URLs are not allowed");
  }

  let res: Response;
  try {
    res = await fetchPublicUrl(url, AbortSignal.timeout(10_000));
  } catch (err: unknown) {
    if (err instanceof BlockedHostError) {
      throw new ValidationError("Private and local URLs are not allowed");
    }
    const msg = err instanceof Error ? err.message : "Network error";
    throw new ValidationError(`Failed to fetch URL: ${msg}`);
  }

  if (!res.ok) {
    throw new ValidationError(`URL returned HTTP ${res.status}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("text/")) {
    throw new ValidationError(
      "URL must return text content (text/plain or text/markdown)",
    );
  }

  const MAX_BYTES = 100_000;
  const reader = res.body?.getReader();
  if (!reader) throw new ValidationError("No response body");

  let total = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new ValidationError("File too large (max 100KB)");
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  // ---- /skills/import — must come before /skills/:id -------------------------

  app.post(
    "/skills/import",
    { schema: { body: ImportSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.import(workspaceId, req.body);
      reply.status(201);
      return skill;
    },
  );

  app.post(
    "/skills/import-url",
    { schema: { body: ImportUrlBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const body = await safeFetchSkillUrl(req.body.url);

      // Layer 1: instant regex scan — blocks obvious injection immediately.
      const regexResult = regexScan(body);

      const skill = await service.import(workspaceId, {
        name: req.body.name,
        body,
        source: req.body.source ?? "imported_url",
        description: req.body.description,
        // URL-imported skills start disabled — must be manually vetted before use.
        enabled: false,
        threatLevel: regexResult.threatLevel,
      });

      // Layer 2: async LLM scan — runs in background after response is sent.
      app.container
        .llm("openai")
        .then((llm) =>
          llmScan(body, llm)
            .then((llmResult) => {
              // LLM result upgrades threat level but never downgrades from 'dangerous'.
              const finalLevel =
                regexResult.threatLevel === THREAT_LEVEL.DANGEROUS
                  ? THREAT_LEVEL.DANGEROUS
                  : llmResult.threatLevel;
              return service.updateThreatLevel(skill.id, finalLevel);
            })
            .catch(() => {
              /* LLM scan failure is non-fatal */
            }),
        )
        .catch(() => {
          /* container.llm failure is non-fatal */
        });

      reply.status(201);
      return skill;
    },
  );

  // ---- /skills/:id/stats, /versions, /restore — before plain /:id -----------

  app.get(
    "/skills/:id/stats",
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const stats = await service.stats(workspaceId, req.params.id);
      if (!stats) throw new NotFoundError("Skill not found");
      return stats;
    },
  );

  app.get(
    "/skills/:id/versions",
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.versions(workspaceId, req.params.id);
    },
  );

  app.post(
    "/skills/:id/restore",
    { schema: { params: IdParams, body: RestoreBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restore(
        workspaceId,
        req.params.id,
        req.body.version,
      );
      if (!skill) throw new NotFoundError("Skill or version not found");
      reply.status(201);
      return skill;
    },
  );

  // ---- /skills (collection) --------------------------------------------------

  app.get("/skills", async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.post(
    "/skills",
    { schema: { body: CreateSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.create(workspaceId, req.body);
      reply.status(201);
      return skill;
    },
  );

  // ---- /skills/:id (item) ----------------------------------------------------

  app.get("/skills/:id", { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError("Skill not found");
    return skill;
  });

  app.put(
    "/skills/:id",
    { schema: { params: IdParams, body: UpdateSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError("Skill not found");

      // If body was updated, re-scan synchronously so the response contains the final threat_level.
      if (req.body.body !== undefined) {
        const newBody = req.body.body;
        const regexResult = regexScan(newBody);
        // Start with regex result — SAFE/SUSPICIOUS/DANGEROUS. Only skip LLM if already DANGEROUS.
        let finalLevel: ThreatLevel = regexResult.threatLevel;

        if (finalLevel !== THREAT_LEVEL.DANGEROUS) {
          try {
            const llm = await app.container.llm("openai");
            const llmResult = await llmScan(newBody, llm);
            // Take the more severe of the two results — LLM can upgrade but not downgrade.
            const severity: Record<ThreatLevel, number> = {
              safe: 0,
              unknown: 1,
              suspicious: 2,
              dangerous: 3,
            };
            if (severity[llmResult.threatLevel] > severity[finalLevel]) {
              finalLevel = llmResult.threatLevel;
            }
          } catch {
            // LLM unavailable — keep regex result (SAFE if body was clean)
          }
        }

        await service.updateThreatLevel(skill.id, finalLevel);
        return { ...skill, threat_level: finalLevel };
      }

      return skill;
    },
  );

  app.delete("/skills/:id", { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError("Skill not found");
    return { ok: true };
  });
}
