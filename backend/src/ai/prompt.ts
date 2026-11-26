// Prompt builder. PROMPT_VERSION is logged with every AI call so replies can be
// traced back to the instructions that produced them.
//
// The facts object contains no student name, id, class, phone number or chat
// id. The model is told to refer to "the student" only.

import type { Language } from "../generated/prisma/enums.js";
import type { ExplanationFacts } from "./types.js";

export const PROMPT_VERSION = "v1";

const LANGUAGE_NAME: Record<Language, string> = {
  en: "English",
  te: "Telugu",
};

export interface BuiltPrompt {
  systemInstruction: string;
  prompt: string;
  promptVersion: string;
}

function systemInstruction(language: Language): string {
  return [
    "You are a kind school communication assistant.",
    "You explain school facts that have already been calculated for a parent.",
    "",
    "Rules:",
    "- Use ONLY the facts in the message. Never calculate, change, add or infer a number, date, subject or trend.",
    "- Refer to the child only as \"the student\". Never mention a name, id, class, phone number or chat id.",
    "- Never label the student (for example \"weak\", \"lazy\", \"bad\") and never compare the student with other children.",
    "- Do not make medical, psychological, disciplinary or diagnostic claims.",
    "- Write 2 to 4 short, warm sentences, then 1 to 3 practical suggestions as bullet points starting with \"•\".",
    "- Use plain text only: no markdown, no numbered lists, no headings.",
    "- Write every number with digits (for example 21, not twenty-one). Do not use digits except numbers that appear in the facts. Do not put numbers in the suggestions.",
    "- Do not repeat a source line or date range; the app adds that separately.",
    `- Reply entirely in ${LANGUAGE_NAME[language]}. Do not mix languages.`,
  ].join("\n");
}

function subjectLines(facts: ExplanationFacts): string[] {
  return facts.marks.subjects.map((subject) => {
    const trend =
      subject.trend === "up" ? "improving" : subject.trend === "down" ? "declining" : "steady";
    return `- ${subject.subject}: average ${subject.average}% over ${subject.tests} tests, trend ${trend}`;
  });
}

export function buildExplanationPrompt(
  facts: ExplanationFacts,
  language: Language,
): BuiltPrompt {
  const lines = [
    `Question type: ${facts.focus === "progress" ? "overall progress" : "marks"}`,
    `Reply language: ${LANGUAGE_NAME[language]}`,
    `Student: the student`,
    "",
    "Facts (already calculated, do not recalculate):",
    `Marks range: ${facts.marks.from} to ${facts.marks.to}`,
    "Subjects:",
    ...subjectLines(facts),
  ];

  if (facts.attendance) {
    lines.push(
      "",
      `Attendance range: ${facts.attendance.from} to ${facts.attendance.to}`,
      `Attendance: ${facts.attendance.recordedDays} recorded school days; ` +
        `${facts.attendance.attendedDays} attended (${facts.attendance.percentage}%); ` +
        `present ${facts.attendance.present}, late ${facts.attendance.late}, absent ${facts.attendance.absent}`,
    );
  }

  return {
    systemInstruction: systemInstruction(language),
    prompt: lines.join("\n"),
    promptVersion: PROMPT_VERSION,
  };
}
