// Shared synthetic facts for the AI evaluation. Pure data: no database, no
// network, so the eval runs anywhere.

import {
  summarizeAttendance,
  summarizeFees,
  summarizeMarks,
  type AttendanceEntry,
  type FeeEntry,
  type MarkEntry,
} from "../../src/services/calculations.js";

function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export const EVAL_ATTENDANCE: AttendanceEntry[] = [
  { date: day("2026-11-02"), status: "present" },
  { date: day("2026-11-03"), status: "present" },
  { date: day("2026-11-04"), status: "present" },
  { date: day("2026-11-05"), status: "present" },
  { date: day("2026-11-06"), status: "present" },
  { date: day("2026-11-09"), status: "present" },
  { date: day("2026-11-10"), status: "present" },
  { date: day("2026-11-11"), status: "present" },
  { date: day("2026-11-12"), status: "late" },
  { date: day("2026-11-13"), status: "absent" },
];

export const EVAL_MARKS: MarkEntry[] = [
  { subject: "Mathematics", test_name: "Unit Test 1", score: 40, max_score: 100, date: day("2026-10-01") },
  { subject: "Mathematics", test_name: "Unit Test 2", score: 50, max_score: 100, date: day("2026-10-15") },
  { subject: "Mathematics", test_name: "Unit Test 3", score: 80, max_score: 100, date: day("2026-11-10") },
  { subject: "English", test_name: "Unit Test 1", score: 70, max_score: 100, date: day("2026-10-01") },
  { subject: "English", test_name: "Unit Test 2", score: 70, max_score: 100, date: day("2026-10-15") },
  { subject: "English", test_name: "Unit Test 3", score: 70, max_score: 100, date: day("2026-11-10") },
];

export const EVAL_FEES: FeeEntry[] = [
  { amount: 4500, due_date: day("2026-09-15"), paid: false },
  { amount: 4500, due_date: day("2026-12-15"), paid: false },
  { amount: 4500, due_date: day("2026-06-15"), paid: true },
];

export const EVAL_ANNOUNCEMENTS = [
  { id: "eval-ann-1", text: "Annual sports day is on 12 December." },
];

const marks = summarizeMarks(EVAL_MARKS);
const attendance = summarizeAttendance(EVAL_ATTENDANCE);

if (!marks || !attendance) {
  throw new Error("Evaluation fixtures did not produce summaries");
}

export const EVAL_SUMMARIES = {
  marks,
  attendance,
  fees: summarizeFees(EVAL_FEES, attendance.to),
  announcements: EVAL_ANNOUNCEMENTS,
};
