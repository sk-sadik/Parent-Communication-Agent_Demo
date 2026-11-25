// Pure calculation helpers. No database, no Telegram: everything here is
// unit tested directly.
//
// DATE RULE: nothing in this file calls `new Date()` for "today". Callers pass
// real records, and ranges are anchored to the latest record so the demo keeps
// working whenever it is run.

export type Trend = "up" | "down" | "flat";

export interface AttendanceEntry {
  date: Date;
  status: "present" | "absent" | "late";
}

export interface AttendanceSummary {
  from: Date;
  to: Date;
  recordedDays: number;
  present: number;
  late: number;
  absent: number;
  attendedDays: number;
  percentage: number;
}

export interface MarkEntry {
  subject: string;
  test_name: string;
  score: number;
  max_score: number;
  date: Date;
}

export interface SubjectSummary {
  subject: string;
  average: number;
  tests: number;
  trend: Trend;
}

export interface MarksSummary {
  from: Date;
  to: Date;
  subjects: SubjectSummary[];
}

export interface FeeEntry {
  amount: number;
  due_date: Date;
  paid: boolean;
}

export interface FeeSummary {
  totalDue: number;
  overdueAmount: number;
  overdueCount: number;
  unpaidCount: number;
  nextDueDate: Date | null;
  hasOverdue: boolean;
  earliestDueDate: Date | null;
  latestDueDate: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function maxDate(dates: readonly (Date | null | undefined)[]): Date | null {
  let latest: Date | null = null;
  for (const date of dates) {
    if (!date) continue;
    if (!latest || date.getTime() > latest.getTime()) {
      latest = date;
    }
  }
  return latest;
}

export function minDate(dates: readonly (Date | null | undefined)[]): Date | null {
  let earliest: Date | null = null;
  for (const date of dates) {
    if (!date) continue;
    if (!earliest || date.getTime() < earliest.getTime()) {
      earliest = date;
    }
  }
  return earliest;
}

/**
 * Latest real record date across attendance and marks. Used as the "as of"
 * reference instead of the machine clock.
 */
export function latestRecordDate(
  attendance: readonly AttendanceEntry[],
  marks: readonly MarkEntry[],
): Date | null {
  return maxDate([...attendance.map((row) => row.date), ...marks.map((row) => row.date)]);
}

/**
 * Attendance percentage for a window ending on the latest attendance record.
 * Late still counts as attended; the denominator is the number of recorded
 * school days in the window, not calendar days.
 */
export function summarizeAttendance(
  records: readonly AttendanceEntry[],
  windowDays = 30,
): AttendanceSummary | null {
  if (records.length === 0) return null;

  const latest = maxDate(records.map((row) => row.date));
  if (!latest) return null;

  const windowStart = new Date(latest.getTime() - (windowDays - 1) * DAY_MS);
  const inRange = records.filter(
    (row) => row.date.getTime() >= windowStart.getTime() && row.date.getTime() <= latest.getTime(),
  );

  if (inRange.length === 0) return null;

  // Report the range the records actually cover, not the full window.
  const from = minDate(inRange.map((row) => row.date)) ?? windowStart;
  const to = latest;

  const present = inRange.filter((row) => row.status === "present").length;
  const late = inRange.filter((row) => row.status === "late").length;
  const absent = inRange.filter((row) => row.status === "absent").length;
  const attendedDays = present + late;

  return {
    from,
    to,
    recordedDays: inRange.length,
    present,
    late,
    absent,
    attendedDays,
    percentage: round1((attendedDays / inRange.length) * 100),
  };
}

/** Simple trend over a test sequence: compare last with first. */
export function calculateTrend(scores: readonly number[], threshold = 2): Trend {
  if (scores.length < 2) return "flat";
  const first = scores[0];
  const last = scores[scores.length - 1];
  if (first === undefined || last === undefined) return "flat";
  const delta = last - first;
  if (delta > threshold) return "up";
  if (delta < -threshold) return "down";
  return "flat";
}

/**
 * Per-subject averages as a percentage of max_score, with a trend across the
 * test sequence (ordered by date, then test name).
 */
export function summarizeMarks(marks: readonly MarkEntry[]): MarksSummary | null {
  if (marks.length === 0) return null;

  const from = minDate(marks.map((row) => row.date));
  const to = maxDate(marks.map((row) => row.date));
  if (!from || !to) return null;

  const bySubject = new Map<string, MarkEntry[]>();
  for (const mark of marks) {
    const list = bySubject.get(mark.subject) ?? [];
    list.push(mark);
    bySubject.set(mark.subject, list);
  }

  const subjects: SubjectSummary[] = [...bySubject.entries()]
    .map(([subject, rows]) => {
      const ordered = [...rows].sort(
        (a, b) => a.date.getTime() - b.date.getTime() || a.test_name.localeCompare(b.test_name),
      );
      const percentages = ordered.map((row) =>
        row.max_score > 0 ? (row.score / row.max_score) * 100 : 0,
      );
      const average = percentages.reduce((sum, value) => sum + value, 0) / percentages.length;

      return {
        subject,
        average: round1(average),
        tests: ordered.length,
        trend: calculateTrend(percentages),
      };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject));

  return { from, to, subjects };
}

/**
 * Fee totals. Overdue is judged against the supplied reference date (the
 * latest school record), never the system clock.
 */
export function summarizeFees(
  fees: readonly FeeEntry[],
  referenceDate: Date | null,
): FeeSummary {
  const unpaid = fees.filter((fee) => !fee.paid);

  const totalDue = round2(unpaid.reduce((sum, fee) => sum + fee.amount, 0));

  const overdue = referenceDate
    ? unpaid.filter((fee) => fee.due_date.getTime() < referenceDate.getTime())
    : [];
  const overdueAmount = round2(overdue.reduce((sum, fee) => sum + fee.amount, 0));

  // "Next due" means the next payment that is not yet past its due date.
  const upcoming = referenceDate
    ? unpaid.filter((fee) => fee.due_date.getTime() >= referenceDate.getTime())
    : unpaid;
  const nextDueDate = minDate(upcoming.map((fee) => fee.due_date));
  const earliestDueDate = minDate(fees.map((fee) => fee.due_date));
  const latestDueDate = maxDate(fees.map((fee) => fee.due_date));

  return {
    totalDue,
    overdueAmount,
    overdueCount: overdue.length,
    unpaidCount: unpaid.length,
    nextDueDate,
    hasOverdue: overdue.length > 0,
    earliestDueDate,
    latestDueDate,
  };
}
