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

interface StudentLine {
  name: string;
  class: string;
}

const SUBJECTS: Record<string, { en: string; te: string }> = {
  mathematics: { en: "Mathematics", te: "గణితం" },
  maths: { en: "Mathematics", te: "గణితం" },
  math: { en: "Mathematics", te: "గణితం" },
  english: { en: "English", te: "ఇంగ్లీష్" },
  science: { en: "Science", te: "సైన్స్" },
  telugu: { en: "Telugu", te: "తెలుగు" },
  social: { en: "Social", te: "సాంఘిక" },
  "social studies": { en: "Social Studies", te: "సాంఘిక శాస్త్రం" },
  hindi: { en: "Hindi", te: "హిందీ" },
};

const TRENDS: Record<Trend, { en: string; te: string }> = {
  up: { en: "improving", te: "మెరుగుపడుతోంది" },
  down: { en: "declining", te: "తగ్గుతోంది" },
  flat: { en: "steady", te: "స్థిరంగా ఉంది" },
};

function subjectLabel(subject: string, language: Language): string {
  const entry = SUBJECTS[subject.trim().toLowerCase()];
  if (!entry) return subject;
  return entry[language];
}

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

export function marksReply(
  student: StudentLine,
  summary: MarksSummary,
  language: Language,
): string {
  const range = formatDateRange(summary.from, summary.to, language);
  const testCount = Math.max(...summary.subjects.map((subject) => subject.tests));

  const lines = summary.subjects.map((subject) => {
    const label = subjectLabel(subject.subject, language);
    const trend = TRENDS[subject.trend][language];
    return `• ${label}: ${language === "te" ? "సగటు" : "average"} ${formatPercent(
      subject.average,
    )} (${trend})`;
  });

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
