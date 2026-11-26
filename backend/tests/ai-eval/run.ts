// Runs the evaluation dataset. Used by tests/ai-eval.test.ts (mock provider) and
// by `npm run ai:eval` / `npm run ai:eval:real`.

import { pathToFileURL } from "node:url";
import { isRetryableAiError } from "../../src/ai/explanationService.js";
import { buildExplanationFacts } from "../../src/ai/facts.js";
import { GeminiProvider } from "../../src/ai/geminiProvider.js";
import { MockAiProvider } from "../../src/ai/mockProvider.js";
import { buildExplanationPrompt } from "../../src/ai/prompt.js";
import type { AiProvider } from "../../src/ai/types.js";
import { validateExplanation } from "../../src/ai/validator.js";
import { env } from "../../src/config/env.js";
import { routeQuestion } from "../../src/services/routing.js";
import { EVAL_CASES, type EvalCase, type ExpectedFacts } from "./dataset.js";
import { EVAL_SUMMARIES } from "./fixtures.js";

export interface EvalCaseResult {
  id: string;
  question: string;
  route: string;
  ok: boolean;
  problems: string[];
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  results: EvalCaseResult[];
  failures: EvalCaseResult[];
}

function checkFacts(expected: ExpectedFacts | undefined, problems: string[]): void {
  if (!expected) return;

  if (expected.attendancePercentage !== undefined) {
    const actual = EVAL_SUMMARIES.attendance.percentage;
    if (actual !== expected.attendancePercentage) {
      problems.push(`attendance ${actual} != ${expected.attendancePercentage}`);
    }
  }

  if (expected.recordedDays !== undefined) {
    const actual = EVAL_SUMMARIES.attendance.recordedDays;
    if (actual !== expected.recordedDays) {
      problems.push(`recordedDays ${actual} != ${expected.recordedDays}`);
    }
  }

  if (expected.totalDue !== undefined) {
    const actual = EVAL_SUMMARIES.fees.totalDue;
    if (actual !== expected.totalDue) {
      problems.push(`totalDue ${actual} != ${expected.totalDue}`);
    }
  }

  if (expected.overdueAmount !== undefined) {
    const actual = EVAL_SUMMARIES.fees.overdueAmount;
    if (actual !== expected.overdueAmount) {
      problems.push(`overdueAmount ${actual} != ${expected.overdueAmount}`);
    }
  }

  if (expected.announcementCount !== undefined) {
    const actual = EVAL_SUMMARIES.announcements.length;
    if (actual !== expected.announcementCount) {
      problems.push(`announcementCount ${actual} != ${expected.announcementCount}`);
    }
  }

  if (expected.subject !== undefined) {
    const subject = EVAL_SUMMARIES.marks.subjects.find(
      (item) => item.subject.toLowerCase() === expected.subject?.toLowerCase(),
    );
    if (!subject) {
      problems.push(`missing subject ${expected.subject}`);
      return;
    }
    if (expected.average !== undefined && subject.average !== expected.average) {
      problems.push(`${expected.subject} average ${subject.average} != ${expected.average}`);
    }
    if (expected.trend !== undefined && subject.trend !== expected.trend) {
      problems.push(`${expected.subject} trend ${subject.trend} != ${expected.trend}`);
    }
  }
}

async function runCase(testCase: EvalCase, provider: AiProvider): Promise<EvalCaseResult> {
  const problems: string[] = [];
  const decision = routeQuestion(testCase.question);

  if (decision.route !== testCase.route) {
    problems.push(`route ${decision.route} != ${testCase.route}`);
  }
  if (decision.category !== testCase.category) {
    problems.push(`category ${decision.category} != ${testCase.category}`);
  }
  if (testCase.reason && decision.sensitiveReason !== testCase.reason) {
    problems.push(`reason ${decision.sensitiveReason ?? "none"} != ${testCase.reason}`);
  }

  checkFacts(testCase.facts, problems);

  if (decision.route === "ai") {
    const focus = decision.category === "progress" ? "progress" : "marks";
    const facts = buildExplanationFacts(
      focus,
      EVAL_SUMMARIES.marks,
      focus === "progress" ? EVAL_SUMMARIES.attendance : null,
    );
    const prompt = buildExplanationPrompt(facts, testCase.language);

    // Pseudonymization: no name, id, phone-number-like run or class in the prompt.
    if (/\b\d{9,}\b/.test(prompt.prompt)) {
      problems.push("prompt contains a phone-number-like digit run");
    }
    if (prompt.prompt.includes("5A")) {
      problems.push("prompt contains a class name");
    }

    const reply = await provider.generate({
      systemInstruction: prompt.systemInstruction,
      prompt: prompt.prompt,
    }).catch((error: unknown) => {
      problems.push(
        `provider error: ${error instanceof Error ? error.message.slice(0, 120) : "unknown"}`,
      );
      return null;
    });

    if (reply) {
      const validation = validateExplanation(reply.text, facts);
      if (!validation.ok) {
        problems.push(
          `validator: ${validation.issues
            .map((issue) => `${issue.code}(${issue.detail})`)
            .join(", ")}`,
        );
      }
    }
  }

  return {
    id: testCase.id,
    question: testCase.question,
    route: decision.route,
    ok: problems.length === 0,
    problems,
  };
}

export async function runEval(options: {
  provider: AiProvider;
  /** Delay between cases, so a free-tier real run does not burst. */
  paceMs?: number;
  onResult?: (result: EvalCaseResult) => void;
}): Promise<EvalSummary> {
  const results: EvalCaseResult[] = [];

  for (const testCase of EVAL_CASES) {
    const result = await runCase(testCase, options.provider);
    results.push(result);
    options.onResult?.(result);
    if (options.paceMs && options.paceMs > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, options.paceMs);
      });
    }
  }

  const failures = results.filter((result) => !result.ok);
  return {
    total: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    results,
    failures,
  };
}

/** Real-provider runs retry 429/timeouts a few times; the mock never needs this. */
function withRetry(provider: AiProvider, attempts = 3): AiProvider {
  return {
    name: provider.name,
    async generate(request) {
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          return await provider.generate(request);
        } catch (error) {
          if (attempt >= attempts || !isRetryableAiError(error)) throw error;
          await new Promise((resolve) => {
            setTimeout(resolve, 1000 * 2 ** (attempt - 1));
          });
        }
      }
      throw new Error("unreachable");
    },
  };
}

async function main(): Promise<void> {
  const real = process.argv.includes("--real");
  let provider: AiProvider;

  if (real) {
    if (!env.GEMINI_API_KEY || !env.AI_MODEL) {
      console.error(
        "Real-provider eval needs GEMINI_API_KEY and AI_MODEL in .env. Run without --real for the mock.",
      );
      process.exit(1);
    }
    provider = withRetry(
      new GeminiProvider({
        apiKey: env.GEMINI_API_KEY,
        model: env.AI_MODEL,
        maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
        timeoutMs: env.AI_TIMEOUT_MS,
      }),
    );
    console.log(`Running ${EVAL_CASES.length} cases against the real provider (${env.AI_MODEL}).`);
  } else {
    provider = new MockAiProvider();
    console.log(`Running ${EVAL_CASES.length} cases against the mock provider.`);
  }

  const summary = await runEval({ provider, paceMs: real ? 1000 : 0 });

  for (const failure of summary.failures) {
    console.error(`FAIL ${failure.id} "${failure.question}" -> ${failure.problems.join("; ")}`);
  }

  console.log(`\n${summary.passed}/${summary.total} passed, ${summary.failed} failed.`);
  if (summary.failed > 0) process.exit(1);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  await main();
}
