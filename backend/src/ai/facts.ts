// Converts Phase 3 calculation results into the pseudonymized facts object sent
// to the model. Only numbers, dates, subject names and trends leave the backend;
// student names, ids, classes, phone numbers and chat ids never do.

import type {
  AttendanceSummary,
  MarksSummary,
} from "../services/calculations.js";
import type { ExplanationFacts } from "./types.js";

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildExplanationFacts(
  focus: "marks" | "progress",
  marks: MarksSummary,
  attendance: AttendanceSummary | null,
): ExplanationFacts {
  return {
    focus,
    marks: {
      from: isoDay(marks.from),
      to: isoDay(marks.to),
      subjects: marks.subjects.map((subject) => ({
        subject: subject.subject,
        average: subject.average,
        tests: subject.tests,
        trend: subject.trend,
      })),
    },
    ...(attendance
      ? {
          attendance: {
            from: isoDay(attendance.from),
            to: isoDay(attendance.to),
            recordedDays: attendance.recordedDays,
            present: attendance.present,
            late: attendance.late,
            absent: attendance.absent,
            attendedDays: attendance.attendedDays,
            percentage: attendance.percentage,
          },
        }
      : {}),
  };
}
