// Evaluation dataset: at least 50 English and Telugu parent questions with the
// expected route (deterministic / AI explanation / escalate), the expected
// category, and the facts the answer must be grounded in.
//
// The same dataset runs against the mock provider by default and against the
// real provider with `npm run ai:eval:real`.

import type { Language } from "../../src/generated/prisma/enums.js";
import type { QuestionCategory } from "../../src/services/classifier.js";
import type { SensitivityReason } from "../../src/services/sensitivity.js";
import type { Trend } from "../../src/services/calculations.js";

export type EvalRoute = "deterministic" | "ai" | "escalate";

export interface ExpectedFacts {
  attendancePercentage?: number;
  recordedDays?: number;
  totalDue?: number;
  overdueAmount?: number;
  subject?: string;
  average?: number;
  trend?: Trend;
  announcementCount?: number;
}

export interface EvalCase {
  id: string;
  question: string;
  language: Language;
  route: EvalRoute;
  category: QuestionCategory;
  reason?: SensitivityReason;
  facts?: ExpectedFacts;
}

const attendanceFacts: ExpectedFacts = { attendancePercentage: 90, recordedDays: 10 };
const feeFacts: ExpectedFacts = { totalDue: 9000, overdueAmount: 4500 };
const announcementFacts: ExpectedFacts = { announcementCount: 1 };
const mathsFacts: ExpectedFacts = { subject: "Mathematics", average: 56.7, trend: "up" };
const progressFacts: ExpectedFacts = { ...attendanceFacts, ...mathsFacts };

export const EVAL_CASES: EvalCase[] = [
  // --- deterministic: attendance ---
  { id: "att-01", question: "What is my child's attendance?", language: "en", route: "deterministic", category: "attendance", facts: attendanceFacts },
  { id: "att-02", question: "How many days was my child absent?", language: "en", route: "deterministic", category: "attendance", facts: attendanceFacts },
  { id: "att-03", question: "Is my child attending school regularly?", language: "en", route: "deterministic", category: "attendance", facts: attendanceFacts },
  { id: "att-04", question: "Show me the attendance record", language: "en", route: "deterministic", category: "attendance", facts: attendanceFacts },
  { id: "att-05", question: "Was my child late this month?", language: "en", route: "deterministic", category: "attendance", facts: attendanceFacts },
  { id: "att-06", question: "How many school days of attendance are recorded?", language: "en", route: "deterministic", category: "attendance", facts: attendanceFacts },
  { id: "att-07", question: "నా పిల్లల హాజరు ఎలా ఉంది?", language: "te", route: "deterministic", category: "attendance", facts: attendanceFacts },
  { id: "att-08", question: "నా పిల్లల హాజరు రోజూ ఉందా?", language: "te", route: "deterministic", category: "attendance", facts: attendanceFacts },
  { id: "att-09", question: "హాజరు వివరాలు చెప్పండి", language: "te", route: "deterministic", category: "attendance", facts: attendanceFacts },
  { id: "att-10", question: "మా పిల్లలు ఆలస్యంగా వచ్చారా?", language: "te", route: "deterministic", category: "attendance", facts: attendanceFacts },
  { id: "att-11", question: "naa pillala hajaru ela undi?", language: "te", route: "deterministic", category: "attendance", facts: attendanceFacts },
  { id: "att-12", question: "gairhajaru entha undi?", language: "te", route: "deterministic", category: "attendance", facts: attendanceFacts },

  // --- deterministic: fees ---
  { id: "fee-01", question: "Are there any fees due?", language: "en", route: "deterministic", category: "fees", facts: feeFacts },
  { id: "fee-02", question: "How much fee is pending?", language: "en", route: "deterministic", category: "fees", facts: feeFacts },
  { id: "fee-03", question: "Is any payment overdue?", language: "en", route: "deterministic", category: "fees", facts: feeFacts },
  { id: "fee-04", question: "What is the next fee due date?", language: "en", route: "deterministic", category: "fees", facts: feeFacts },
  { id: "fee-05", question: "Show my fee balance", language: "en", route: "deterministic", category: "fees", facts: feeFacts },
  { id: "fee-06", question: "Have all fees been paid?", language: "en", route: "deterministic", category: "fees", facts: feeFacts },
  { id: "fee-07", question: "ఫీజు బాకీ ఉందా?", language: "te", route: "deterministic", category: "fees", facts: feeFacts },
  { id: "fee-08", question: "ఎంత ఫీజు చెల్లించాలి?", language: "te", route: "deterministic", category: "fees", facts: feeFacts },
  { id: "fee-09", question: "ఫీజు గడువు ఎప్పుడు?", language: "te", route: "deterministic", category: "fees", facts: feeFacts },
  { id: "fee-10", question: "fee baaki unda?", language: "te", route: "deterministic", category: "fees", facts: feeFacts },

  // --- deterministic: announcements ---
  { id: "ann-01", question: "Any announcements for the class?", language: "en", route: "deterministic", category: "announcements", facts: announcementFacts },
  { id: "ann-02", question: "Is there a notice today?", language: "en", route: "deterministic", category: "announcements", facts: announcementFacts },
  { id: "ann-03", question: "Any school events this week?", language: "en", route: "deterministic", category: "announcements", facts: announcementFacts },
  { id: "ann-04", question: "Are there holidays announced?", language: "en", route: "deterministic", category: "announcements", facts: announcementFacts },
  { id: "ann-05", question: "Show class circulars", language: "en", route: "deterministic", category: "announcements", facts: announcementFacts },
  { id: "ann-06", question: "తరగతికి ప్రకటనలు ఉన్నాయా?", language: "te", route: "deterministic", category: "announcements", facts: announcementFacts },
  { id: "ann-07", question: "ఈ వారం ఏమైనా కార్యక్రమాలు ఉన్నాయా?", language: "te", route: "deterministic", category: "announcements", facts: announcementFacts },
  { id: "ann-08", question: "సెలవు ప్రకటన ఉందా?", language: "te", route: "deterministic", category: "announcements", facts: announcementFacts },

  // --- AI explanation: marks ---
  { id: "mrk-01", question: "How are the marks?", language: "en", route: "ai", category: "marks", facts: mathsFacts },
  { id: "mrk-02", question: "What are my child's marks in Mathematics?", language: "en", route: "ai", category: "marks", facts: mathsFacts },
  { id: "mrk-03", question: "Show me the exam results", language: "en", route: "ai", category: "marks", facts: mathsFacts },
  { id: "mrk-04", question: "How did my child score in English?", language: "en", route: "ai", category: "marks", facts: { subject: "English", average: 70, trend: "flat" } },
  { id: "mrk-05", question: "What is the average in Science?", language: "en", route: "ai", category: "marks", facts: mathsFacts },
  { id: "mrk-06", question: "Are the marks improving?", language: "en", route: "ai", category: "marks", facts: mathsFacts },
  { id: "mrk-07", question: "How was the unit test?", language: "en", route: "ai", category: "marks", facts: mathsFacts },
  { id: "mrk-08", question: "Tell me the subject scores", language: "en", route: "ai", category: "marks", facts: mathsFacts },
  { id: "mrk-09", question: "మార్కులు ఎలా ఉన్నాయి?", language: "te", route: "ai", category: "marks", facts: mathsFacts },
  { id: "mrk-10", question: "గణితంలో మార్కులు ఎలా ఉన్నాయి?", language: "te", route: "ai", category: "marks", facts: mathsFacts },

  // --- AI explanation: overall progress ---
  { id: "prg-01", question: "How is my child doing?", language: "en", route: "ai", category: "progress", facts: progressFacts },
  { id: "prg-02", question: "How is my child doing in Maths?", language: "en", route: "ai", category: "progress", facts: progressFacts },
  { id: "prg-03", question: "What is my child's overall progress?", language: "en", route: "ai", category: "progress", facts: progressFacts },
  { id: "prg-04", question: "How is my ward's school performance?", language: "en", route: "ai", category: "progress", facts: progressFacts },
  { id: "prg-05", question: "What is my child's overall progress this term?", language: "en", route: "ai", category: "progress", facts: progressFacts },
  { id: "prg-06", question: "How is my child's school performance?", language: "en", route: "ai", category: "progress", facts: progressFacts },
  { id: "prg-07", question: "నా పిల్లల ప్రగతి ఎలా ఉంది?", language: "te", route: "ai", category: "progress", facts: progressFacts },
  { id: "prg-08", question: "మొత్తం పనితీరు ఎలా ఉంది?", language: "te", route: "ai", category: "progress", facts: progressFacts },

  // --- escalate: sensitive questions are never answered by AI ---
  { id: "esc-01", question: "My child is being bullied at school", language: "en", route: "escalate", category: "other", reason: "bullying" },
  { id: "esc-02", question: "My child has fever and is unwell", language: "en", route: "escalate", category: "other", reason: "health" },
  { id: "esc-03", question: "The teacher punished my child", language: "en", route: "escalate", category: "other", reason: "discipline" },
  { id: "esc-04", question: "I want to file a complaint about a fee", language: "en", route: "escalate", category: "fees", reason: "dispute" },
  { id: "esc-05", question: "My child is depressed and stressed", language: "en", route: "escalate", category: "other", reason: "wellbeing" },
  { id: "esc-06", question: "Another student threatened my child", language: "en", route: "escalate", category: "other", reason: "bullying" },
  { id: "esc-07", question: "Is my child sick?", language: "en", route: "escalate", category: "other", reason: "health" },
  { id: "esc-08", question: "I have a fee dispute with the school", language: "en", route: "escalate", category: "fees", reason: "dispute" },
  { id: "esc-09", question: "నా పిల్లలను బెదిరిస్తున్నారు", language: "te", route: "escalate", category: "other", reason: "bullying" },
  { id: "esc-10", question: "నా పిల్లలకు జ్వరం ఉంది", language: "te", route: "escalate", category: "other", reason: "health" },
  { id: "esc-11", question: "ఉపాధ్యాయుడు నా పిల్లలను శిక్షించారు", language: "te", route: "escalate", category: "other", reason: "discipline" },
  { id: "esc-12", question: "ఫీజు ఫిర్యాదు చేయాలి", language: "te", route: "escalate", category: "fees", reason: "dispute" },

  // --- escalate: unsupported questions ---
  { id: "esc-13", question: "Can you call me?", language: "en", route: "escalate", category: "other" },
  { id: "esc-14", question: "What is the principal's phone number?", language: "en", route: "escalate", category: "other" },
  { id: "esc-15", question: "నాకు ఉపాధ్యాయుడితో మాట్లాడాలి", language: "te", route: "escalate", category: "other" },
  { id: "esc-16", question: "Please change my child's class", language: "en", route: "escalate", category: "other" },
];
