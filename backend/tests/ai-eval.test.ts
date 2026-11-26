import { describe, expect, it } from "vitest";
import { MockAiProvider } from "../src/ai/mockProvider.js";
import { runEval } from "./ai-eval/run.js";

describe("AI evaluation dataset", () => {
  it("has at least 50 English and Telugu questions", async () => {
    const { EVAL_CASES } = await import("./ai-eval/dataset.js");
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(50);
    expect(EVAL_CASES.some((testCase) => testCase.language === "en")).toBe(true);
    expect(EVAL_CASES.some((testCase) => testCase.language === "te")).toBe(true);
    expect(EVAL_CASES.some((testCase) => testCase.route === "deterministic")).toBe(true);
    expect(EVAL_CASES.some((testCase) => testCase.route === "ai")).toBe(true);
    expect(EVAL_CASES.some((testCase) => testCase.route === "escalate")).toBe(true);
  });

  it("routes every question as expected and the mock reply passes the validator", async () => {
    const summary = await runEval({ provider: new MockAiProvider() });

    expect(summary.failures).toEqual([]);
    expect(summary.total).toBeGreaterThanOrEqual(50);
    expect(summary.passed).toBe(summary.total);
  });
});
