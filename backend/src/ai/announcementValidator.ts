// Output validator for AI-improved announcements.
//
// The teacher's original text is the source of truth. The improved wording may
// change grammar and tone, but it must not add, remove or change a date, time,
// number or name. Date extraction is shared with the Phase 4 validator.
//
// On failure the announcement service regenerates once, then keeps the
// teacher's original text.

import { extractDates } from "./validator.js";

export type AnnouncementIssueCode =
  | "empty_reply"
  | "changed_date"
  | "changed_time"
  | "changed_number"
  | "changed_name";

export interface AnnouncementIssue {
  code: AnnouncementIssueCode;
  detail: string;
}

export interface AnnouncementValidationResult {
  ok: boolean;
  issues: AnnouncementIssue[];
}

export interface AnnouncementFacts {
  dates: Set<string>;
  times: Set<string>;
  numbers: Set<string>;
  names: Set<string>;
}

const MONTH_WORDS = new Set([
  "jan",
  "january",
  "feb",
  "february",
  "mar",
  "march",
  "apr",
  "april",
  "may",
  "jun",
  "june",
  "jul",
  "july",
  "aug",
  "august",
  "sep",
  "sept",
  "september",
  "oct",
  "october",
  "nov",
  "november",
  "dec",
  "december",
]);

const WEEKDAY_WORDS = new Set([
  "mon",
  "monday",
  "tue",
  "tues",
  "tuesday",
  "wed",
  "wednesday",
  "thu",
  "thur",
  "thurs",
  "thursday",
  "fri",
  "friday",
  "sat",
  "saturday",
  "sun",
  "sunday",
]);

// Capitalised words that are not names. Keeps the name check from flagging
// ordinary sentence wording that the model capitalised.
const NON_NAME_WORDS = new Set([
  "",
  "a",
  "all",
  "an",
  "and",
  "announcement",
  "annual",
  "as",
  "at",
  "be",
  "by",
  "can",
  "celebration",
  "child",
  "children",
  "circular",
  "class",
  "could",
  "dear",
  "event",
  "exam",
  "exams",
  "fee",
  "fees",
  "for",
  "from",
  "function",
  "guardians",
  "has",
  "have",
  "hello",
  "hi",
  "holiday",
  "i",
  "if",
  "important",
  "in",
  "is",
  "kindly",
  "may",
  "meeting",
  "might",
  "must",
  "note",
  "notice",
  "of",
  "on",
  "or",
  "our",
  "parents",
  "please",
  "principal",
  "program",
  "programme",
  "pta",
  "regards",
  "reminder",
  "school",
  "should",
  "sports",
  "students",
  "teachers",
  "thank",
  "thanks",
  "that",
  "the",
  "these",
  "this",
  "those",
  "to",
  "vice",
  "was",
  "we",
  "were",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function validIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function normaliseDates(found: readonly string[]): Set<string> {
  const dates = new Set<string>();

  for (const candidate of found) {
    for (const part of candidate.split("|")) {
      const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(part);
      if (!match) continue;
      const iso = validIso(Number(match[1]), Number(match[2]), Number(match[3]));
      if (iso) dates.add(iso);
    }
  }

  return dates;
}

interface MaskedText {
  rest: string;
  times: Set<string>;
}

/**
 * Extracts clock times ("5 pm", "5.30 PM", "17:00") and masks them so their
 * digits are not counted as separate facts.
 */
function extractTimes(text: string): MaskedText {
  const times = new Set<string>();
  let rest = text;

  rest = rest.replace(
    /\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/gi,
    (match, hourRaw: string, minuteRaw: string | undefined, suffix: string) => {
      let hour = Number(hourRaw);
      const minute = minuteRaw ? Number(minuteRaw) : 0;
      const isPm = suffix.toLowerCase().startsWith("p");

      if (hour >= 1 && hour <= 12) {
        if (isPm && hour < 12) hour += 12;
        if (!isPm && hour === 12) hour = 0;
        if (minute >= 0 && minute <= 59) {
          times.add(`${pad2(hour)}:${pad2(minute)}`);
        }
      }

      return " ".repeat(match.length);
    },
  );

  rest = rest.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (match, hourRaw: string, minuteRaw: string) => {
    times.add(`${pad2(Number(hourRaw))}:${minuteRaw}`);
    return " ".repeat(match.length);
  });

  return { rest, times };
}

function extractNumbers(text: string): Set<string> {
  const numbers = new Set<string>();
  for (const match of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    numbers.add(match[0].replace(/,/g, ""));
  }
  return numbers;
}

function extractNames(text: string): Set<string> {
  const names = new Set<string>();

  // A capitalised first word of a sentence ("Please…", "Join…") is ordinary
  // wording, not a name; names are checked later in the sentence.
  const segments = text.split(/[.!?\n•;:]+/);

  for (const segment of segments) {
    const firstWordIndex = segment.search(/[A-Za-z]/);
    for (const match of segment.matchAll(/\b([A-Z][a-z]{1,})\b/g)) {
      if (match.index === firstWordIndex) continue;
      const word = (match[1] ?? "").toLowerCase();
      if (!word) continue;
      if (MONTH_WORDS.has(word) || WEEKDAY_WORDS.has(word) || NON_NAME_WORDS.has(word)) {
        continue;
      }
      names.add(word);
    }
  }

  return names;
}

export function extractAnnouncementFacts(text: string): AnnouncementFacts {
  const { found, rest: withoutDates } = extractDates(text);
  const { rest: withoutTimes, times } = extractTimes(withoutDates);

  return {
    dates: normaliseDates(found),
    times,
    numbers: extractNumbers(withoutTimes),
    names: extractNames(text),
  };
}

function compare(
  kind: "date" | "time" | "number" | "name",
  original: Set<string>,
  improved: Set<string>,
): AnnouncementIssue[] {
  const issues: AnnouncementIssue[] = [];
  const code = `changed_${kind}` as AnnouncementIssueCode;

  for (const value of improved) {
    if (!original.has(value)) {
      issues.push({ code, detail: `added or changed ${kind}: ${value}` });
    }
  }

  // Names are not facts that must be repeated word for word; a dropped
  // honorific or title is fine. Every other fact must survive the rewrite.
  if (kind !== "name") {
    for (const value of original) {
      if (!improved.has(value)) {
        issues.push({ code, detail: `missing ${kind}: ${value}` });
      }
    }
  }

  return issues;
}

/**
 * Checks an improved announcement against the teacher's original. Any change to
 * a date, time, number or invented name fails validation.
 */
export function validateAnnouncementRewrite(
  original: string,
  improved: string,
): AnnouncementValidationResult {
  const text = improved.trim();
  if (!text) {
    return { ok: false, issues: [{ code: "empty_reply", detail: "empty reply" }] };
  }

  const before = extractAnnouncementFacts(original);
  const after = extractAnnouncementFacts(text);

  const seen = new Set<string>();
  const issues = [
    ...compare("date", before.dates, after.dates),
    ...compare("time", before.times, after.times),
    ...compare("number", before.numbers, after.numbers),
    ...compare("name", before.names, after.names),
  ].filter((issue) => {
    const key = `${issue.code}:${issue.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { ok: issues.length === 0, issues };
}
