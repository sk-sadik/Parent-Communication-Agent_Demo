// Output validator for AI explanations.
//
// The model only explains facts that code already calculated. This validator
// re-checks the reply before it reaches a parent:
//   * every number / percentage must be one of the calculated values (exact, or
//     that value rounded to a whole number),
//   * every date must be one of the calculated range endpoints,
//   * every subject name must be one the facts actually contain.
//
// If the reply fails, the caller regenerates once and then falls back to the
// Phase 3 template answer.

import { KNOWN_SUBJECT_NAMES, subjectAliases } from "../services/subjects.js";
import type { ExplanationFacts } from "./types.js";

export type ValidationIssueCode =
  | "empty_reply"
  | "wrong_number"
  | "wrong_date"
  | "unknown_subject";

export interface ValidationIssue {
  code: ValidationIssueCode;
  detail: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

const EN_MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const TE_MONTHS: Record<string, number> = {
  జనవరి: 1,
  ఫిబ్రవరి: 2,
  మార్చి: 3,
  ఏప్రిల్: 4,
  మే: 5,
  జూన్: 6,
  జూలై: 7,
  ఆగస్టు: 8,
  సెప్టెంబర్: 9,
  అక్టోబర్: 10,
  నవంబర్: 11,
  డిసెంబర్: 12,
};

// School subjects that are not in the fact set. If the model mentions one of
// these, it invented a subject and the reply must not be sent.
const OTHER_SCHOOL_SUBJECTS = [
  "History",
  "Geography",
  "Civics",
  "Computer Science",
  "Computers",
  "Physics",
  "Chemistry",
  "Biology",
  "Botany",
  "Zoology",
  "Environmental Studies",
  "EVS",
  "Art",
  "Drawing",
  "Painting",
  "Music",
  "Dance",
  "Physical Education",
  "Moral Science",
  "Sanskrit",
  "Urdu",
  "French",
];

const ENGLISH_DATE = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s+(\d{4})\b/g;
const TELUGU_DATE =
  /\b(\d{1,2})\s+(జనవరి|ఫిబ్రవరి|మార్చి|ఏప్రిల్|మే|జూన్|జూలై|ఆగస్టు|సెప్టెంబర్|అక్టోబర్|నవంబర్|డిసెంబర్)\s+(\d{4})\b/g;
const ISO_DATE = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
const NUMERIC_DATE = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Every date key the facts allow: the marks range and the attendance range. */
export function allowedDates(facts: ExplanationFacts): Set<string> {
  const dates = new Set<string>([facts.marks.from, facts.marks.to]);
  if (facts.attendance) {
    dates.add(facts.attendance.from);
    dates.add(facts.attendance.to);
  }
  return dates;
}

export interface ExtractedDates {
  found: string[];
  /** The text with every matched date blanked out, so years are not counted as
   * stray numbers. */
  rest: string;
}

export function extractDates(text: string): ExtractedDates {
  const found: string[] = [];
  let rest = text;

  rest = rest.replace(ENGLISH_DATE, (match, dayRaw: string, monthRaw: string, yearRaw: string) => {
    const month = EN_MONTHS[monthRaw.toLowerCase()];
    if (month) found.push(isoDate(Number(yearRaw), month, Number(dayRaw)));
    return " ".repeat(match.length);
  });

  rest = rest.replace(TELUGU_DATE, (match, dayRaw: string, monthRaw: string, yearRaw: string) => {
    const month = TE_MONTHS[monthRaw];
    if (month) found.push(isoDate(Number(yearRaw), month, Number(dayRaw)));
    return " ".repeat(match.length);
  });

  rest = rest.replace(ISO_DATE, (match, yearRaw: string, monthRaw: string, dayRaw: string) => {
    found.push(isoDate(Number(yearRaw), Number(monthRaw), Number(dayRaw)));
    return " ".repeat(match.length);
  });

  // Day and month order is ambiguous, so keep both candidates; the caller
  // accepts the date when either one is allowed.
  rest = rest.replace(
    NUMERIC_DATE,
    (match, firstRaw: string, secondRaw: string, yearRaw: string) => {
      const first = Number(firstRaw);
      const second = Number(secondRaw);
      const year = Number(yearRaw);
      found.push(`${isoDate(year, second, first)}|${isoDate(year, first, second)}`);
      return " ".repeat(match.length);
    },
  );

  return { found, rest };
}

function dateAllowed(candidate: string, allowed: Set<string>): boolean {
  return candidate.split("|").some((value) => allowed.has(value));
}

/**
 * Values the reply may contain. Rounding rule: a calculated value may be written
 * exactly, or rounded to the nearest whole number (56.7 -> 57, 66.7 -> 67).
 * Nothing else is accepted.
 */
function allowedNumbers(facts: ExplanationFacts): Set<number> {
  const values = new Set<number>();

  const add = (value: number): void => {
    values.add(Math.round(value * 10) / 10);
    values.add(Math.round(value));
  };

  for (const subject of facts.marks.subjects) {
    add(subject.average);
    values.add(subject.tests);
  }

  if (facts.attendance) {
    const attendance = facts.attendance;
    add(attendance.recordedDays);
    add(attendance.present);
    add(attendance.late);
    add(attendance.absent);
    add(attendance.attendedDays);
    add(attendance.percentage);
  }

  return values;
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

// Spelled-out numbers are numbers too. "one" is excluded because it is usually
// an article ("one thing"), not a fact.
const SMALL_NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS_WORDS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

interface SpelledNumber {
  value: number;
  word: string;
}

function extractSpelledNumbers(text: string): SpelledNumber[] {
  const tokens = text
    .toLowerCase()
    .replace(/[-–]/g, " ")
    .split(/[^a-z]+/)
    .filter(Boolean);

  const found: SpelledNumber[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;

    const tens = TENS_WORDS[token];
    if (tens !== undefined) {
      let value = tens;
      let word = token;
      const next = tokens[index + 1];
      if (next === "one") {
        value += 1;
        word = `${word} ${next}`;
        index += 1;
      } else if (next !== undefined) {
        const small = SMALL_NUMBER_WORDS[next];
        if (small !== undefined && small < 10) {
          value += small;
          word = `${word} ${next}`;
          index += 1;
        }
      }
      found.push({ value, word });
      continue;
    }

    const small = SMALL_NUMBER_WORDS[token];
    if (small !== undefined) {
      found.push({ value: small, word: token });
    }
  }

  return found;
}

function subjectVocabulary(facts: ExplanationFacts): string[] {
  return [
    ...new Set([
      ...KNOWN_SUBJECT_NAMES,
      ...OTHER_SCHOOL_SUBJECTS,
      ...facts.marks.subjects.flatMap((subject) => subjectAliases(subject.subject)),
    ]),
  ];
}

function allowedSubjectTerms(facts: ExplanationFacts): string[] {
  return [
    ...new Set(
      facts.marks.subjects.flatMap((subject) => subjectAliases(subject.subject).map(normalise)),
    ),
  ];
}

function mentionsTerm(text: string, term: string): boolean {
  const lowered = text.toLowerCase();
  const candidate = term.toLowerCase();
  // Telugu script has no word boundaries; English terms are matched as words.
  if (/[^\u0000-\u024f]/.test(candidate)) return lowered.includes(candidate);
  const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(lowered);
}

function subjectAllowed(candidate: string, allowedTerms: string[]): boolean {
  const term = normalise(candidate);
  return allowedTerms.some((allowed) => allowed === term || allowed.startsWith(`${term} `));
}

/**
 * Validates an AI reply against the facts that were sent to the model.
 */
export function validateExplanation(reply: string, facts: ExplanationFacts): ValidationResult {
  const text = reply.trim();

  if (!text) {
    return { ok: false, issues: [{ code: "empty_reply", detail: "empty reply" }] };
  }

  const issues: ValidationIssue[] = [];
  const dateSet = allowedDates(facts);
  const { found: foundDates, rest } = extractDates(text);

  for (const found of foundDates) {
    if (!dateAllowed(found, dateSet)) {
      issues.push({ code: "wrong_date", detail: found.replace("|", " or ") });
    }
  }

  const allowedValues = allowedNumbers(facts);
  for (const match of rest.matchAll(/\d+(?:\.\d+)?/g)) {
    const value = Number(match[0]);
    const matches = [...allowedValues].some((allowed) => Math.abs(allowed - value) < 0.05);
    if (!matches) {
      issues.push({ code: "wrong_number", detail: match[0] });
    }
  }

  for (const spelled of extractSpelledNumbers(text)) {
    const matches = [...allowedValues].some(
      (allowed) => Math.abs(allowed - spelled.value) < 0.05,
    );
    if (!matches) {
      issues.push({ code: "wrong_number", detail: spelled.word });
    }
  }

  const allowedTerms = allowedSubjectTerms(facts);
  for (const term of subjectVocabulary(facts)) {
    if (mentionsTerm(text, term) && !subjectAllowed(term, allowedTerms)) {
      issues.push({ code: "unknown_subject", detail: term });
    }
  }

  // The same invented subject can be detected through several aliases; report it once.
  const seen = new Set<string>();
  const unique = issues.filter((issue) => {
    const key = `${issue.code}:${issue.detail.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { ok: unique.length === 0, issues: unique };
}
