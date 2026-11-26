// Shared AI types. Facts here are pre-calculated by Phase 3 code; the model
// only explains them. No names, ids, phone numbers or chat ids belong here.

import type { Trend } from "../services/calculations.js";

export interface AttendanceFact {
  from: string; // ISO date, e.g. 2026-10-27
  to: string;
  recordedDays: number;
  present: number;
  late: number;
  absent: number;
  attendedDays: number;
  percentage: number;
}

export interface SubjectFact {
  subject: string;
  average: number;
  tests: number;
  trend: Trend;
}

export interface ExplanationFacts {
  focus: "marks" | "progress";
  attendance?: AttendanceFact;
  marks: {
    from: string;
    to: string;
    subjects: SubjectFact[];
  };
}

export interface AiGenerateRequest {
  systemInstruction: string;
  prompt: string;
}

export interface AiGenerateResult {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
}

export interface AiProvider {
  readonly name: string;
  generate(request: AiGenerateRequest): Promise<AiGenerateResult>;
}
