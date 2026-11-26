// Provider and logger wiring.
//
// The provider is built once from env. Without GEMINI_API_KEY or AI_MODEL the
// bot keeps working with Phase 3 template answers and logs that AI is disabled.
// Tests inject a mock with setAiProvider, so no test ever reaches the network.

import { env } from "../config/env.js";
import { GeminiProvider } from "./geminiProvider.js";
import { AiLimiter } from "./limiter.js";
import type { AiProvider } from "./types.js";

export interface AiLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const silentLogger: AiLogger = {
  info() {},
  warn() {},
  error() {},
};

let logger: AiLogger = silentLogger;

export function setAiLogger(next: AiLogger): void {
  logger = next;
}

export function aiLogger(): AiLogger {
  return logger;
}

let providerOverride: AiProvider | null | undefined;
let cachedProvider: AiProvider | null | undefined;
let loggedDisabled = false;

/** Tests use this to inject a mock (or null to simulate a missing key). */
export function setAiProvider(provider: AiProvider | null): void {
  providerOverride = provider;
}

/** Restores env-based provider selection. */
export function resetAiProvider(): void {
  providerOverride = undefined;
  cachedProvider = undefined;
  loggedDisabled = false;
}

export function getAiProvider(): AiProvider | null {
  if (providerOverride !== undefined) return providerOverride;

  if (cachedProvider !== undefined) return cachedProvider;

  if (!env.GEMINI_API_KEY || !env.AI_MODEL) {
    if (!loggedDisabled) {
      logger.warn(
        "AI disabled: GEMINI_API_KEY or AI_MODEL is not set. Template answers will be used.",
      );
      loggedDisabled = true;
    }
    cachedProvider = null;
    return cachedProvider;
  }

  cachedProvider = new GeminiProvider({
    apiKey: env.GEMINI_API_KEY,
    model: env.AI_MODEL,
    maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
    timeoutMs: env.AI_TIMEOUT_MS,
  });
  return cachedProvider;
}

let cachedLimiter: AiLimiter | undefined;
let limiterOverride: AiLimiter | undefined;

/** Tests use this to inject a limiter with a small daily limit. */
export function setAiLimiter(limiter: AiLimiter | undefined): void {
  limiterOverride = limiter;
}

/** Shared limiter for the whole process (long polling runs in one process). */
export function getAiLimiter(): AiLimiter {
  if (limiterOverride) return limiterOverride;
  if (!cachedLimiter) {
    cachedLimiter = new AiLimiter({
      dailyLimit: env.AI_DAILY_LIMIT,
      maxConcurrent: 2,
      maxQueue: 8,
    });
  }
  return cachedLimiter;
}
