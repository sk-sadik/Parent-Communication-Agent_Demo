// Single routing decision for a parent question. The answer service and the
// evaluation dataset both use this, so tests describe the real behaviour.

import { classifyQuestion, type QuestionCategory } from "./classifier.js";
import { detectSensitive, type SensitivityReason } from "./sensitivity.js";

export type AnswerRoute = "deterministic" | "ai" | "escalate";

export interface RoutingDecision {
  route: AnswerRoute;
  category: QuestionCategory;
  sensitiveReason?: SensitivityReason;
}

export function routeQuestion(question: string): RoutingDecision {
  const category = classifyQuestion(question);
  const sensitiveReason = detectSensitive(question);

  // Sensitive questions never reach the AI, even if they also mention marks.
  if (sensitiveReason) {
    return { route: "escalate", category, sensitiveReason };
  }

  if (category === "attendance" || category === "fees" || category === "announcements") {
    return { route: "deterministic", category };
  }

  if (category === "marks" || category === "progress") {
    return { route: "ai", category };
  }

  // Unsupported question: a teacher should see it, not the AI.
  return { route: "escalate", category };
}
