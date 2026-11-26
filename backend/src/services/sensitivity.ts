// Detects questions that must never be answered by the AI: discipline, health,
// bullying, disputes and anything beyond the school records. Rule-based, in
// English, Telugu script and common transliterated Telugu.

export type SensitivityReason =
  | "discipline"
  | "health"
  | "bullying"
  | "dispute"
  | "wellbeing";

interface SensitivityRule {
  reason: SensitivityReason;
  latin: RegExp[];
  telugu: string[];
}

const RULES: SensitivityRule[] = [
  {
    reason: "bullying",
    latin: [
      /\bbull(y|ied|ying)\b/,
      /\bharass(ed|ment|ing)?\b/,
      /\brag(ging|ged)?\b/,
      /\bteas(ed|ing)\b/,
      /\bthreat(en|ened|ening)?\b/,
      /\bbeat(en|ing)?\b/,
      /\bhit(ting)?\b/,
      /\bslap(ped|ping)?\b/,
      /\bbedirimpu\b/,
      /\bbedirin(ch|g)\w*\b/,
      /\bkottad(u|u)\b/,
      /\bvedimpu\b/,
      /\bvedin(ch|g)\w*\b/,
    ],
    telugu: ["బెదిరింపు", "బెదిరించ", "బెదిరిస్త", "వేధింపు", "వేధించ", "కొట్ట", "గొడవ", "దెబ్బ"],
  },
  {
    reason: "health",
    latin: [
      /\bhealth\b/,
      /\bill(ness)?\b/,
      /\bsick\b/,
      /\bfever\b/,
      /\bdoctor\b/,
      /\bhospital\b/,
      /\bmedicine\b/,
      /\bmedical\b/,
      /\binjur(y|ed|ies)\b/,
      /\ballerg(y|ies)\b/,
      /\bjvaram\b/,
      /\bjabbu\b/,
      /\barogyam\b/,
      /\bdoctor(u)?\b/,
      /\baashupatri\b/,
    ],
    telugu: ["ఆరోగ్య", "అనారోగ్య", "జ్వరం", "జబ్బు", "వైద్య", "డాక్టర్", "ఆసుపత్రి", "మందు", "గాయం"],
  },
  {
    reason: "discipline",
    latin: [
      /\bdisciplin(e|ary|ed)\b/,
      /\bpunish(ed|ment|ing)?\b/,
      /\bscold(ed|ing)?\b/,
      /\bsuspend(ed|sion)?\b/,
      /\bmisbehav(e|ed|iour|ior)\b/,
      /\bnaughty\b/,
      /\bshiksha\b/,
      /\bkramashikshana\b/,
    ],
    telugu: ["క్రమశిక్షణ", "శిక్ష", "తిట్ట", "సస్పెండ్", "అల్లరి"],
  },
  {
    reason: "dispute",
    latin: [
      /\bdispute(s|d)?\b/,
      /\bcomplain(t|ts|ed|ing)?\b/,
      /\brefund(s|ed)?\b/,
      /\bovercharg(e|ed|ing)\b/,
      /\bextra (fee|fees|amount|charge|charges)\b/,
      /\bwrong (fee|fees|amount|charge|charges)\b/,
      /\bfee (dispute|problem|issue|mistake)\b/,
      /\bargu(e|ed|ment|ing)\b/,
      /\bfight(ing)?\b/,
      /\bconflict\b/,
      /\bphiryadu\b/,
      /\bfiryadu\b/,
      /\bgodava\b/,
    ],
    telugu: ["ఫిర్యాదు", "గొడవ", "తగాదా", "రిఫండ్", "అధిక ఫీజు", "తప్పు ఫీజు"],
  },
  {
    reason: "wellbeing",
    latin: [
      /\bdepress(ed|ion)?\b/,
      /\banxi(ety|ous)\b/,
      /\bsuicid(e|al)\b/,
      /\bmental health\b/,
      /\bstress(ed)?\b/,
      /\bemotion(al)?\b/,
      /\bmannasika\b/,
    ],
    telugu: ["మానసిక", "ఆందోళన", "ఒత్తిడి", "డిప్రెషన్"],
  },
];

/**
 * Returns the reason this question needs a teacher, or null when it is safe for
 * the deterministic/AI flow.
 */
export function detectSensitive(question: string): SensitivityReason | null {
  const text = question.toLowerCase().trim();
  if (!text) return null;

  for (const rule of RULES) {
    if (rule.latin.some((pattern) => pattern.test(text))) return rule.reason;
    if (rule.telugu.some((word) => text.includes(word))) return rule.reason;
  }

  return null;
}
