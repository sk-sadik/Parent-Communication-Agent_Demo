// Template replies for calculated facts. English and Telugu.
//
// Every reply states where the numbers came from and the date range (or the
// "as of" record date), so nothing looks like a guess.

import type { Language } from "../generated/prisma/enums.js";
import type {
  AttendanceSummary,
  FeeSummary,
  MarksSummary,
  Trend,
} from "../services/calculations.js";
import { formatAmount, formatDate, formatDateRange, formatPercent } from "../services/format.js";
import { subjectLabel } from "../services/subjects.js";

interface StudentLine {
  name: string;
  class: string;
}

const TRENDS: Record<Trend, { en: string; te: string }> = {
  up: { en: "improving", te: "మెరుగుపడుతోంది" },
  down: { en: "declining", te: "తగ్గుతోంది" },
  flat: { en: "steady", te: "స్థిరంగా ఉంది" },
};

export function attendanceReply(
  student: StudentLine,
  summary: AttendanceSummary,
  language: Language,
): string {
  const range = formatDateRange(summary.from, summary.to, language);
  const percentage = formatPercent(summary.percentage);

  if (language === "te") {
    return (
      `${student.name} హాజరు (తరగతి ${student.class})\n` +
      `${range} వరకు హాజరు నమోదుల ఆధారంగా (${summary.recordedDays} పాఠశాల రోజులు):\n` +
      `హాజరైన రోజులు: ${summary.attendedDays} (${percentage})\n` +
      `హాజరు: ${summary.present}, ఆలస్యం: ${summary.late}, గైర్హాజరు: ${summary.absent}`
    );
  }

  return (
    `Attendance for ${student.name} (class ${student.class})\n` +
    `Based on attendance records from ${range} (${summary.recordedDays} school days):\n` +
    `Attended ${summary.attendedDays} days (${percentage})\n` +
    `Present: ${summary.present}, Late: ${summary.late}, Absent: ${summary.absent}`
  );
}

function testCountOf(summary: MarksSummary): number {
  return Math.max(0, ...summary.subjects.map((subject) => subject.tests));
}

function subjectBullets(summary: MarksSummary, language: Language): string[] {
  return summary.subjects.map((subject) => {
    const label = subjectLabel(subject.subject, language);
    const trend = TRENDS[subject.trend][language];
    return `• ${label}: ${language === "te" ? "సగటు" : "average"} ${formatPercent(
      subject.average,
    )} (${trend})`;
  });
}

function marksHeader(student: StudentLine, language: Language): string {
  return language === "te"
    ? `${student.name} మార్కులు (తరగతి ${student.class})`
    : `Marks for ${student.name} (class ${student.class})`;
}

function marksSource(summary: MarksSummary, language: Language): string {
  const range = formatDateRange(summary.from, summary.to, language);
  const testCount = testCountOf(summary);
  return language === "te"
    ? `మూలం: ${range} మార్కులు (సబ్జెక్టుకు ${testCount} పరీక్షలు).`
    : `Source: marks from ${range} (${testCount} tests per subject).`;
}

export function marksReply(
  student: StudentLine,
  summary: MarksSummary,
  language: Language,
): string {
  const range = formatDateRange(summary.from, summary.to, language);
  const testCount = testCountOf(summary);
  const lines = subjectBullets(summary, language);

  if (language === "te") {
    return (
      `${student.name} మార్కులు (తరగతి ${student.class})\n` +
      `${range} వరకు మార్కుల ఆధారంగా (సబ్జెక్టుకు ${testCount} పరీక్షలు):\n` +
      lines.join("\n")
    );
  }

  return (
    `Marks for ${student.name} (class ${student.class})\n` +
    `Based on marks from ${range} (${testCount} tests per subject):\n` +
    lines.join("\n")
  );
}

/**
 * Marks answer with a calculated facts block, the validated AI explanation and
 * the source line at the end.
 */
export function groundedMarksReply(
  student: StudentLine,
  summary: MarksSummary,
  explanation: string,
  language: Language,
): string {
  return [
    [marksHeader(student, language), ...subjectBullets(summary, language)].join("\n"),
    explanation,
    marksSource(summary, language),
  ].join("\n\n");
}

function attendanceBullet(attendance: AttendanceSummary, language: Language): string {
  return language === "te"
    ? `• హాజరు: ${formatPercent(attendance.percentage)} (${attendance.recordedDays} పాఠశాల రోజులు)`
    : `• Attendance: ${formatPercent(attendance.percentage)} (${attendance.recordedDays} school days)`;
}

function progressSource(
  summary: MarksSummary,
  attendance: AttendanceSummary | null,
  language: Language,
): string {
  const marksRange = formatDateRange(summary.from, summary.to, language);
  const testCount = testCountOf(summary);

  if (language === "te") {
    const attendancePart = attendance
      ? `; ${formatDateRange(attendance.from, attendance.to, language)} హాజరు (${attendance.recordedDays} పాఠశాల రోజులు)`
      : "";
    return `మూలం: ${marksRange} మార్కులు (సబ్జెక్టుకు ${testCount} పరీక్షలు)${attendancePart}.`;
  }

  const attendancePart = attendance
    ? `; attendance from ${formatDateRange(attendance.from, attendance.to, language)} (${
        attendance.recordedDays
      } school days)`
    : "";
  return `Source: marks from ${marksRange} (${testCount} tests per subject)${attendancePart}.`;
}

function progressBlock(
  student: StudentLine,
  summary: MarksSummary,
  attendance: AttendanceSummary | null,
  language: Language,
): string {
  const header =
    language === "te"
      ? `${student.name} ప్రగతి (తరగతి ${student.class})`
      : `Progress for ${student.name} (class ${student.class})`;
  const lines = [header, ...subjectBullets(summary, language)];
  if (attendance) lines.push(attendanceBullet(attendance, language));
  return lines.join("\n");
}

/** Progress answer with facts, validated explanation and source line. */
export function groundedProgressReply(
  student: StudentLine,
  summary: MarksSummary,
  attendance: AttendanceSummary | null,
  explanation: string,
  language: Language,
): string {
  return [
    progressBlock(student, summary, attendance, language),
    explanation,
    progressSource(summary, attendance, language),
  ].join("\n\n");
}

/**
 * Deterministic progress answer used when the AI is unavailable. Phase 3 had no
 * progress template, so this mirrors the marks template plus attendance.
 */
export function progressReply(
  student: StudentLine,
  summary: MarksSummary,
  attendance: AttendanceSummary | null,
  language: Language,
): string {
  return [
    progressBlock(student, summary, attendance, language),
    progressSource(summary, attendance, language),
  ].join("\n\n");
}

export function feesReply(
  student: StudentLine,
  summary: FeeSummary,
  referenceDate: Date | null,
  language: Language,
): string {
  const asOf = referenceDate
    ? language === "te"
      ? `${formatDate(referenceDate, language)} నాటి`
      : `as of ${formatDate(referenceDate, language)}`
    : language === "te"
      ? "నమోదైన"
      : "on record";

  if (summary.totalDue === 0) {
    if (language === "te") {
      return (
        `${student.name} ఫీజు వివరాలు (తరగతి ${student.class})\n` +
        `${asOf} ఫీజు నమోదుల ఆధారంగా:\n` +
        "నమోదైన ఫీజులు అన్నీ చెల్లించబడ్డాయి."
      );
    }
    return (
      `Fees for ${student.name} (class ${student.class})\n` +
      `Based on fee records ${asOf}:\n` +
      "All recorded fees are paid."
    );
  }

  const nextDue = summary.nextDueDate ? formatDate(summary.nextDueDate, language) : null;

  if (language === "te") {
    const lines = [
      `${student.name} ఫీజు వివరాలు (తరగతి ${student.class})`,
      `${asOf} ఫీజు నమోదుల ఆధారంగా:`,
      `చెల్లించాల్సిన మొత్తం: ${formatAmount(summary.totalDue)}`,
    ];
    if (nextDue) lines.push(`తదుపరి గడువు తేదీ: ${nextDue}`);
    lines.push(
      summary.hasOverdue
        ? `గడువు దాటిన మొత్తం: ${formatAmount(summary.overdueAmount)} (${summary.overdueCount} చెల్లింపు)`
        : "గడువు దాటిన చెల్లింపులు లేవు.",
    );
    return lines.join("\n");
  }

  const lines = [
    `Fees for ${student.name} (class ${student.class})`,
    `Based on fee records ${asOf}:`,
    `Total unpaid: ${formatAmount(summary.totalDue)}`,
  ];
  if (nextDue) lines.push(`Next due date: ${nextDue}`);
  lines.push(
    summary.hasOverdue
      ? `Overdue: ${formatAmount(summary.overdueAmount)} (${summary.overdueCount} payment${
          summary.overdueCount === 1 ? "" : "s"
        } past the due date)`
      : "No overdue payments.",
  );
  return lines.join("\n");
}

export function announcementsReply(
  student: StudentLine,
  announcements: readonly { text: string }[],
  referenceDate: Date | null,
  language: Language,
): string {
  const asOf = referenceDate
    ? language === "te"
      ? `${formatDate(referenceDate, language)} నాటికి`
      : `as of ${formatDate(referenceDate, language)}`
    : language === "te"
      ? "ప్రస్తుతం"
      : "currently";

  if (announcements.length === 0) {
    return language === "te"
      ? `తరగతి ${student.class} కోసం ${asOf} ఆమోదించిన ప్రకటనలు ఏమీ లేవు.`
      : `There are no approved announcements for class ${student.class} ${asOf}.`;
  }

  const header =
    language === "te"
      ? `తరగతి ${student.class} ప్రకటనలు (${asOf}):`
      : `Announcements for class ${student.class} (${asOf}):`;

  return [header, ...announcements.map((item) => `• ${item.text}`)].join("\n");
}
