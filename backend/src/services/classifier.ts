// Rule-based question classifier. No AI, no network.
//
// Supports English keywords, Telugu script and a few common transliterated
// Telugu words. Categories map to the data the demo can actually answer.

export type QuestionCategory =
  | "attendance"
  | "marks"
  | "progress"
  | "fees"
  | "announcements"
  | "other";

interface CategoryRule {
  category: Exclude<QuestionCategory, "other">;
  // Latin words are matched as whole words; Telugu script is matched as a
  // substring because word boundaries do not apply to it.
  latin: RegExp[];
  telugu: string[];
}

const RULES: CategoryRule[] = [
  {
    category: "progress",
    latin: [
      /\bhow (is|are) (my|our) (child|children|kid|ward|son|daughter) doing\b/,
      /\boverall (progress|performance|development)\b/,
      /\bprogress\b/,
      /\bdoing in (school|class|studies)\b/,
      /\bschool performance\b/,
      /\bpragathi\b/,
    ],
    telugu: ["ప్రగతి", "మొత్తం పనితీరు", "ఎలా ఉన్నారు"],
  },
  {
    category: "attendance",
    latin: [
      /\battend\w*\b/,
      /\bpresent\b/,
      /\babsent\b/,
      /\babsence\b/,
      /\blate\b/,
      /\bhajar(u|i)\b/,
      /\bhaziri\b/,
      /\bgairhajar(u|i)\b/,
      /\baalsyam\b/,
    ],
    telugu: ["హాజరు", "గైర్హాజరు", "ఆలస్య", "హాజరై", "రాలేదు"],
  },
  {
    category: "marks",
    latin: [
      /\bmarks?\b/,
      /\bscores?\b/,
      /\bexams?\b/,
      /\btests?\b/,
      /\bresults?\b/,
      /\bgrades?\b/,
      /\bmath(s|ematics)?\b/,
      /\bscience\b/,
      /\benglish\b/,
      /\btelugu\b/,
      /\bmarkulu\b/,
      /\bpareeksha\b/,
      /\bpariksha\b/,
      /\bphalitam\b/,
      /\bphalithalu\b/,
      /\bsubjects?\b/,
      /\bstud(y|ies|ying)\b/,
      /\bprogress\b/,
      /\bperformance\b/,
    ],
    telugu: ["మార్కు", "పరీక్ష", "ఫలిత", "సబ్జెక్ట", "స్కోరు", "గణిత", "సైన్స్", "ఇంగ్లీష్", "తెలుగు", "చదువు", "ప్రగతి"],
  },
  {
    category: "fees",
    latin: [
      /\bfees?\b/,
      /\bfeesu\b/,
      /\bpayment\b/,
      /\bpaid\b/,
      /\bdue(s)?\b/,
      /\bamount\b/,
      /\bbalance\b/,
      /\boverdue\b/,
      /\bchellimpu\b/,
      /\bbaaki\b/,
      /\bbaki\b/,
    ],
    telugu: ["ఫీజు", "ఫీసు", "చెల్లింపు", "బాకీ", "బాకి", "రుసుము"],
  },
  {
    category: "announcements",
    latin: [
      /\bannounc\w*\b/,
      /\banounc\w*\b/,
      /\bnotices?\b/,
      /\bcirculars?\b/,
      /\bevents?\b/,
      /\bholidays?\b/,
      /\bsports?\b/,
      /\bnews\b/,
      /\bprakatana\b/,
      /\bnotisu\b/,
      /\bselavu\b/,
    ],
    telugu: ["ప్రకటన", "నోటీసు", "సెలవు", "ఈవెంట్", "కార్యక్రమ"],
  },
];

function countMatches(rule: CategoryRule, text: string): number {
  let hits = 0;
  for (const pattern of rule.latin) {
    if (pattern.test(text)) hits += 1;
  }
  for (const word of rule.telugu) {
    if (text.includes(word)) hits += 1;
  }
  return hits;
}

/**
 * Classifies a parent's message. The category with the most keyword hits wins;
 * ties follow the rule order (progress before attendance, marks, fees and
 * announcements), so "how is my child doing in maths" is treated as progress.
 */
export function classifyQuestion(message: string): QuestionCategory {
  const text = message.toLowerCase().trim();
  if (!text) return "other";

  let best: QuestionCategory = "other";
  let bestHits = 0;

  for (const rule of RULES) {
    const hits = countMatches(rule, text);
    if (hits > bestHits) {
      best = rule.category;
      bestHits = hits;
    }
  }

  return best;
}

export const QUESTION_CATEGORIES: QuestionCategory[] = [
  "attendance",
  "marks",
  "progress",
  "fees",
  "announcements",
];
