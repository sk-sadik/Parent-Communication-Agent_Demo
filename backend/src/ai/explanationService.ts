// Orchestrates one AI explanation:
//   facts -> prompt -> provider (bounded retries) -> validator (one regenerate)
//   -> explanation, or null so the caller can send the Phase 3 template.
//
// Nothing here throws to the caller: a missing key, a rate limit, a timeout, a
// bad reply or a full queue all end in the deterministic template answer.

import { ApiError } from "@google/genai";
import type { Language } from "../generated/prisma/enums.js";
import type { AttendanceSummary, MarksSummary } from "../services/calculations.js";
import { buildExplanationFacts } from "./facts.js";
import { AiQueueFullError, type AiLimiter } from "./limiter.js";
import { buildExplanationPrompt } from "./prompt.js";
import {
  aiLogger,
  getAiLimiter,
  getAiProvider,
  type AiLogger,
} from "./runtime.js";
import type { AiGenerateRequest, AiGenerateResult, AiProvider } from "./types.js";
import { validateExplanation } from "./validator.js";

export const MAX_PROVIDER_ATTEMPTS = 3;
export const BASE_BACKOFF_MS = 500;
export const MAX_VALIDATION_ATTEMPTS = 2; // first reply + one regeneration

export interface ExplainParams {
  guardianId: string;
  language: Language;
  focus: "marks" | "progress";
  marks: MarksSummary;
  attendance: AttendanceSummary | null;
}

export interface ExplainDeps {
  provider: AiProvider | null;
  limiter: AiLimiter;
  logger: AiLogger;
  sleep?: (ms: number) => Promise<void>;
  maxProviderAttempts?: number;
}

export interface ExplainResult {
  /** Null means: send the Phase 3 template answer instead. */
  explanation: string | null;
  usedAi: boolean;
  reason?: "ai_disabled" | "daily_limit" | "queue_full" | "provider_error" | "validator";
}

function defaultDeps(): ExplainDeps {
  return {
    provider: getAiProvider(),
    limiter: getAiLimiter(),
    logger: aiLogger(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) return `status=${error.status}`;
  if (error instanceof Error) return `name=${error.name}`;
  return "unknown";
}

/** 429 / resource exhausted, timeouts and 5xx are worth retrying; nothing else is. */
export function isRetryableAiError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /RESOURCE_EXHAUSTED|\b429\b|rate limit|quota|UNAVAILABLE|\b50[0-9]\b|ETIMEDOUT|timed? ?out/i.test(
    message,
  );
}

export interface GenerateOutcome {
  result: AiGenerateResult | null;
  reason?: ExplainResult["reason"];
}

export async function generateWithRetry(
  provider: AiProvider,
  request: AiGenerateRequest,
  promptVersion: string,
  deps: ExplainDeps,
): Promise<GenerateOutcome> {
  const maxAttempts = deps.maxProviderAttempts ?? MAX_PROVIDER_ATTEMPTS;
  const wait = deps.sleep ?? sleep;
  const logger = deps.logger;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await provider.generate(request);
      // Per-call log: model, prompt version, tokens, latency. Never the key or prompt text.
      logger.info(
        `ai.call model=${result.model} prompt=${promptVersion} input_tokens=${
          result.inputTokens ?? "n/a"
        } output_tokens=${result.outputTokens ?? "n/a"} latency_ms=${
          result.latencyMs
        } attempt=${attempt}`,
      );
      return { result };
    } catch (error) {
      const retryable = isRetryableAiError(error);
      logger.warn(
        `ai.error attempt=${attempt} retryable=${retryable} ${errorDetail(error)}`,
      );
      if (!retryable || attempt >= maxAttempts) {
        return { result: null, reason: "provider_error" };
      }
      await wait(BASE_BACKOFF_MS * 2 ** (attempt - 1));
    }
  }

  return { result: null, reason: "provider_error" };
}

/**
 * Produces a validated explanation, or null when the deterministic template
 * should be used.
 */
export async function explain(
  params: ExplainParams,
  deps: ExplainDeps = defaultDeps(),
): Promise<ExplainResult> {
  const facts = buildExplanationFacts(params.focus, params.marks, params.attendance);
  const provider = deps.provider;

  if (!provider) {
    return { explanation: null, usedAi: false, reason: "ai_disabled" };
  }

  if (!deps.limiter.consumeDaily(params.guardianId)) {
    deps.logger.warn("ai.skipped reason=daily_limit");
    return { explanation: null, usedAi: false, reason: "daily_limit" };
  }

  const prompt = buildExplanationPrompt(facts, params.language);

  try {
    return await deps.limiter.run(async () => {
      for (let validationAttempt = 1; validationAttempt <= MAX_VALIDATION_ATTEMPTS; validationAttempt += 1) {
        const request: AiGenerateRequest = {
          systemInstruction:
            validationAttempt === 1
              ? prompt.systemInstruction
              : `${prompt.systemInstruction}\n- Your previous reply used values that were not in the facts. Reply again using only the facts above.`,
          prompt: prompt.prompt,
        };

        const outcome = await generateWithRetry(provider, request, prompt.promptVersion, deps);
        if (!outcome.result) {
          deps.logger.warn(`ai.fallback reason=${outcome.reason ?? "provider_error"}`);
          return { explanation: null, usedAi: false, reason: outcome.reason ?? "provider_error" };
        }

        const validation = validateExplanation(outcome.result.text, facts);
        deps.logger.info(
          `ai.validation ok=${validation.ok} prompt=${prompt.promptVersion} attempt=${validationAttempt}${
            validation.ok
              ? ""
              : ` issues=${validation.issues.map((issue) => issue.code).join(",")}`
          }`,
        );

        if (validation.ok) {
          return { explanation: outcome.result.text, usedAi: true };
        }

        if (validationAttempt >= MAX_VALIDATION_ATTEMPTS) {
          deps.logger.warn("ai.fallback reason=validator");
          return { explanation: null, usedAi: false, reason: "validator" };
        }
      }

      return { explanation: null, usedAi: false, reason: "validator" };
    });
  } catch (error) {
    if (error instanceof AiQueueFullError) {
      deps.logger.warn("ai.skipped reason=queue_full");
      return { explanation: null, usedAi: false, reason: "queue_full" };
    }
    deps.logger.error(`ai.fallback reason=unexpected ${errorDetail(error)}`);
    return { explanation: null, usedAi: false, reason: "provider_error" };
  }
}
