// Recognises a parent asking to change the reply language, so the bot can show
// the language buttons instead of treating the message as a school question.
//
// Deliberately conservative: a marks question that merely contains the word
// "English" (for example "marks in English") must NOT trigger the picker.

const LANGUAGE_WORD = /\b(language|lang)\b/i;
const TELUGU_LANGUAGE_WORD = /\b(bhasha|bhaasha)\b/i;
const ENGLISH_WORD = /\benglish\b/i;
const TELUGU_WORD = /\btelugu\b/i;

const CHANGE_VERB =
  /\b(change|switch|set|select|choose|prefer|make|speak|talk|reply|respond|write)\b/i;

const EXPLICIT_CHOICE = /^(english|telugu|ఇంగ్లీష్|తెలుగు)[.!]?$/i;

const TRANSLITERATED_CHOICE =
  /\b(english|telugu)\s+(lo|lu|meedha|meeda|matladu|matladandi|cheppu|cheppandi|cheyandi)\b/i;

// "ఇంగ్లీష్" / "తెలుగు" used as a language name, not as the subject Telugu.
const TELUGU_SCRIPT_LANGUAGE = /ఇంగ్లీష్|తెలుగు/;

// A question about marks in English is not a request to change the UI language.
const SUBJECT_WORD =
  /\b(marks?|scores?|exams?|tests?|results?|subjects?|attendance|grades?|fees?)\b|మార్కు|హాజరు|ఫీజు|పరీక్ష/i;

export function isLanguageChangeRequest(text: string): boolean {
  const value = text.trim();
  if (!value) return false;

  if (EXPLICIT_CHOICE.test(value)) return true;
  if (TRANSLITERATED_CHOICE.test(value)) return true;
  if (TELUGU_LANGUAGE_WORD.test(value)) return true;

  // Telugu script: "భాష" means language.
  if (value.includes("భాష")) {
    if (/మార్చ/.test(value)) return true;
    if (!SUBJECT_WORD.test(value) && value.length <= 40) return true;
  }

  // "ఇంగ్లీష్ లో చెప్పండి" / "తెలుగులో చెప్పు", but not "తెలుగు మార్కులు".
  if (TELUGU_SCRIPT_LANGUAGE.test(value)) {
    if (/మార్చ/.test(value)) return true;
    if (!SUBJECT_WORD.test(value) && value.length <= 40) return true;
  }

  if (LANGUAGE_WORD.test(value)) {
    if (CHANGE_VERB.test(value)) return true;
    // A short message that mentions language but no school topic is almost
    // certainly this request.
    if (!SUBJECT_WORD.test(value) && value.length <= 40) return true;
  }

  if (CHANGE_VERB.test(value) && (ENGLISH_WORD.test(value) || TELUGU_WORD.test(value))) {
    return true;
  }

  return false;
}
