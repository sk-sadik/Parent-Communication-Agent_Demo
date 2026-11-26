// Subject labels in both languages. One source of truth for reply templates and
// for the AI output validator, so a subject the model invents cannot slip
// through as a "known" subject.

import type { Language } from "../generated/prisma/enums.js";

interface SubjectLabel {
  en: string;
  te: string;
}

const LABELS: Record<string, SubjectLabel> = {
  mathematics: { en: "Mathematics", te: "గణితం" },
  maths: { en: "Mathematics", te: "గణితం" },
  math: { en: "Mathematics", te: "గణితం" },
  english: { en: "English", te: "ఇంగ్లీష్" },
  science: { en: "Science", te: "సైన్స్" },
  telugu: { en: "Telugu", te: "తెలుగు" },
  hindi: { en: "Hindi", te: "హిందీ" },
  social: { en: "Social", te: "సాంఘిక" },
  "social studies": { en: "Social Studies", te: "సాంఘిక శాస్త్రం" },
};

export function subjectLabel(subject: string, language: Language): string {
  const entry = LABELS[subject.trim().toLowerCase()];
  if (!entry) return subject;
  return entry[language];
}

/** Every name a known subject can be called, in either language. */
export function subjectAliases(subject: string): string[] {
  const entry = LABELS[subject.trim().toLowerCase()];
  if (!entry) return [subject];
  return [...new Set([entry.en, entry.te, subject])];
}

/** Subjects the validator recognises, so it can reject an invented one. */
export const KNOWN_SUBJECT_NAMES: string[] = [
  ...new Set(Object.values(LABELS).flatMap((label) => [label.en, label.te])),
];
