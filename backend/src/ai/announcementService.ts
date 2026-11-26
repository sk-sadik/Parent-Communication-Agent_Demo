// One announcement wording improvement:
//   original -> prompt -> provider (bounded retries) -> validator (one retry)
//   -> improved text, or the teacher's original text.
//
// Reuses the Phase 4 provider, limiter, retry/backoff and logging. There is no
// daily parent limit here: announcements are teacher-authored, but they do
// share the global concurrency limit with parent explanations.

import type { AiLimiter } from "./limiter.js";
import { buildAnnouncementPrompt } from "./announcementPrompt.js";
import { validateAnnouncementRewrite } from "./announcementValidator.js";
import {
  aiLogger,
  getAiLimiter,
  getAiProvider,
  type AiLogger,
} from "./runtime.js";
import { generateWithRetry } from "./explanationService.js";
import type { AiGenerateRequest, AiProvider } from "./types.js";

export const MAX_ANNOUNCEMENT_VALIDATION_ATTEMPTS = 2;

export type AnnouncementAiReason =
  | "ai_disabled"
  | "queue_full"
  | "provider_error"
  | "validator"
  | "empty";

export interface ImproveAnnouncementResult {
  /** Never empty when the input was not empty. */
  text: string;
  usedAi: boolean;
  reason?: AnnouncementAiReason;
}

export interface AnnouncementAiDeps {
  provider: AiProvider | null;
  limiter: AiLimiter;
  logger: AiLogger;
  sleep?: (ms: number) => Promise<void>;
  maxProviderAttempts?: number;
}

function defaultDeps(): AnnouncementAiDeps {
  return {
    provider: getAiProvider(),
    limiter: getAiLimiter(),
    logger: aiLogger(),
  };
}

type QueueFullError = { code?: string };

function isQueueFull(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as QueueFullError).code === "queue_full"
  );
}

/**
 * Improves wording only. Any AI problem returns the teacher's original text, so
 * announcements always work when the AI is disabled.
 */
export async function improveAnnouncementText(
  original: string,
  deps: AnnouncementAiDeps = defaultDeps(),
): Promise<ImproveAnnouncementResult> {
  const source = original.trim();
  if (!source) return { text: "", usedAi: false, reason: "empty" };
  if (!deps.provider) return { text: source, usedAi: false, reason: "ai_disabled" };

  const prompt = buildAnnouncementPrompt(source);

  try {
    return await deps.limiter.run(async () => {
      for (
        let attempt = 1;
        attempt <= MAX_ANNOUNCEMENT_VALIDATION_ATTEMPTS;
        attempt += 1
      ) {
        const request: AiGenerateRequest = {
          systemInstruction:
            attempt === 1
              ? prompt.systemInstruction
              : `${prompt.systemInstruction}\n- Your previous reply changed a fact. Repeat the original facts exactly (dates, times, numbers, names).`,
          prompt: prompt.prompt,
        };

        const outcome = await generateWithRetry(
          deps.provider as AiProvider,
          request,
          prompt.promptVersion,
          deps,
        );

        if (!outcome.result) {
          deps.logger.warn(`ai.announcement.fallback reason=${outcome.reason ?? "provider_error"}`);
          return { text: source, usedAi: false, reason: "provider_error" };
        }

        const validation = validateAnnouncementRewrite(source, outcome.result.text);
        deps.logger.info(
          `ai.announcement.validation ok=${validation.ok} prompt=${prompt.promptVersion} attempt=${attempt}${
            validation.ok
              ? ""
              : ` issues=${validation.issues.map((issue) => issue.code).join(",")}`
          }`,
        );

        if (validation.ok) {
          return { text: outcome.result.text.trim(), usedAi: true };
        }

        if (attempt >= MAX_ANNOUNCEMENT_VALIDATION_ATTEMPTS) {
          deps.logger.warn("ai.announcement.fallback reason=validator");
          return { text: source, usedAi: false, reason: "validator" };
        }
      }

      return { text: source, usedAi: false, reason: "validator" };
    });
  } catch (error) {
    if (isQueueFull(error)) {
      deps.logger.warn("ai.announcement.skipped reason=queue_full");
      return { text: source, usedAi: false, reason: "queue_full" };
    }
    deps.logger.error("ai.announcement.fallback reason=unexpected");
    return { text: source, usedAi: false, reason: "provider_error" };
  }
}
