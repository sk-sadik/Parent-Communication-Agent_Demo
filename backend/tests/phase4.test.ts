import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { explain } from "../src/ai/explanationService.js";
import { buildExplanationFacts } from "../src/ai/facts.js";
import { AiLimiter } from "../src/ai/limiter.js";
import { MockAiProvider } from "../src/ai/mockProvider.js";
import { buildExplanationPrompt, PROMPT_VERSION } from "../src/ai/prompt.js";
import {
  resetAiProvider,
  setAiLimiter,
  setAiProvider,
  setAiLogger,
} from "../src/ai/runtime.js";
import type { AiLogger } from "../src/ai/runtime.js";
import { validateExplanation } from "../src/ai/validator.js";
import { prisma } from "../src/db/prisma.js";
import { answerQuestion, answerQuestionForStudent } from "../src/services/answerService.js";
import {
  summarizeAttendance,
  summarizeMarks,
  type AttendanceEntry,
  type MarkEntry,
} from "../src/services/calculations.js";
import { marksReply } from "../src/telegram/replies.js";

const INST = "inst-p4";
const CHAT_G1 = "p4-chat-g1"; // one child with marks
const CHAT_G2 = "p4-chat-g2"; // two children, one without marks
const CHAT_GTE = "p4-chat-gte"; // Telugu guardian

function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

const ATTENDANCE: AttendanceEntry[] = [
  { date: day("2026-11-02"), status: "present" },
  { date: day("2026-11-03"), status: "present" },
  { date: day("2026-11-04"), status: "present" },
  { date: day("2026-11-05"), status: "present" },
  { date: day("2026-11-06"), status: "present" },
  { date: day("2026-11-09"), status: "present" },
  { date: day("2026-11-10"), status: "present" },
  { date: day("2026-11-11"), status: "present" },
  { date: day("2026-11-12"), status: "late" },
  { date: day("2026-11-13"), status: "absent" },
];

const MARKS: MarkEntry[] = [
  { subject: "Mathematics", test_name: "Unit Test 1", score: 40, max_score: 100, date: day("2026-10-01") },
  { subject: "Mathematics", test_name: "Unit Test 2", score: 50, max_score: 100, date: day("2026-10-15") },
  { subject: "Mathematics", test_name: "Unit Test 3", score: 80, max_score: 100, date: day("2026-11-10") },
  { subject: "English", test_name: "Unit Test 1", score: 70, max_score: 100, date: day("2026-10-01") },
  { subject: "English", test_name: "Unit Test 2", score: 70, max_score: 100, date: day("2026-10-15") },
  { subject: "English", test_name: "Unit Test 3", score: 70, max_score: 100, date: day("2026-11-10") },
];

const marksSummary = summarizeMarks(MARKS);
const attendanceSummary = summarizeAttendance(ATTENDANCE);

if (!marksSummary || !attendanceSummary) {
  throw new Error("Phase 4 fixtures did not produce summaries");
}

const FACTS = buildExplanationFacts("marks", marksSummary, null);
const PROGRESS_FACTS = buildExplanationFacts("progress", marksSummary, attendanceSummary);

const silentLogger: AiLogger = { info() {}, warn() {}, error() {} };

async function resetFixtures(): Promise<void> {
  await prisma.institute.deleteMany({ where: { id: INST } });
  await prisma.institute.create({ data: { id: INST, name: "Phase 4 Institute (synthetic)" } });

  await prisma.guardian.createMany({
    data: [
      { id: "p4-g1", institute_id: INST, name: "Phase Four Parent", language: "en", telegram_chat_id: CHAT_G1 },
      { id: "p4-g2", institute_id: INST, name: "Other Parent", language: "en", telegram_chat_id: CHAT_G2 },
      { id: "p4-gte", institute_id: INST, name: "Telugu Parent", language: "te", telegram_chat_id: CHAT_GTE },
    ],
  });

  await prisma.student.createMany({
    data: [
      { id: "p4-s1", institute_id: INST, name: "Aarav Four", class: "5A", roll_number: "5A-01" },
      { id: "p4-s2", institute_id: INST, name: "Bhavya Four", class: "5A", roll_number: "5A-02" },
      { id: "p4-s3", institute_id: INST, name: "Other Four", class: "5A", roll_number: "5A-03" },
      { id: "p4-s4", institute_id: INST, name: "Telugu Four", class: "5A", roll_number: "5A-04" },
    ],
  });

  await prisma.guardianStudentLink.createMany({
    data: [
      { id: "p4-l1", institute_id: INST, guardian_id: "p4-g1", student_id: "p4-s1", relationship: "mother", verified: true },
      { id: "p4-l2", institute_id: INST, guardian_id: "p4-g2", student_id: "p4-s2", relationship: "father", verified: true },
      { id: "p4-l3", institute_id: INST, guardian_id: "p4-g2", student_id: "p4-s3", relationship: "father", verified: true },
      { id: "p4-l4", institute_id: INST, guardian_id: "p4-gte", student_id: "p4-s4", relationship: "mother", verified: true },
    ],
  });

  await prisma.attendance.createMany({
    data: [
      ...ATTENDANCE.map((row, index) => ({
        id: `p4-a-${index}`,
        institute_id: INST,
        student_id: "p4-s1",
        date: row.date,
        status: row.status,
      })),
      ...ATTENDANCE.map((row, index) => ({
        id: `p4-t-${index}`,
        institute_id: INST,
        student_id: "p4-s4",
        date: row.date,
        status: row.status,
      })),
    ],
  });

  await prisma.mark.createMany({
    data: [
      ...MARKS.map((row, index) => ({
        id: `p4-m-${index}`,
        institute_id: INST,
        student_id: "p4-s1",
        subject: row.subject,
        test_name: row.test_name,
        score: row.score,
        max_score: row.max_score,
        date: row.date,
      })),
      ...MARKS.map((row, index) => ({
        id: `p4-tm-${index}`,
        institute_id: INST,
        student_id: "p4-s4",
        subject: row.subject,
        test_name: row.test_name,
        score: row.score,
        max_score: row.max_score,
        date: row.date,
      })),
      ...MARKS.slice(0, 3).map((row, index) => ({
        id: `p4-om-${index}`,
        institute_id: INST,
        student_id: "p4-s3",
        subject: row.subject,
        test_name: row.test_name,
        score: row.score,
        max_score: row.max_score,
        date: row.date,
      })),
    ],
  });
}

beforeAll(async () => {
  await resetFixtures();
});

beforeEach(() => {
  setAiLogger(silentLogger);
  setAiProvider(new MockAiProvider());
  setAiLimiter(undefined);
});

afterAll(async () => {
  setAiLimiter(undefined);
  resetAiProvider();
  await prisma.institute.deleteMany({ where: { id: INST } });
  await prisma.$disconnect();
});

describe("output validator", () => {
  it("accepts a reply that only repeats calculated facts", () => {
    const reply =
      "The student is improving in Mathematics with an average of 56.7%, and English is steady at 70%. " +
      "Attendance is 90% across 10 school days. • Keep practising a little every day.";

    const result = validateExplanation(reply, PROGRESS_FACTS);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("rejects a deliberately wrong number", () => {
    const result = validateExplanation("The student's Mathematics average is 88%.", FACTS);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({ code: "wrong_number", detail: "88" });
  });

  it("rejects a deliberately wrong date", () => {
    const result = validateExplanation(
      "The student's marks improved from 1 January 2025.",
      FACTS,
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "wrong_date")).toBe(true);
  });

  it("rejects an invented subject", () => {
    const result = validateExplanation(
      "The student is doing well in History and should keep reading.",
      FACTS,
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({ code: "unknown_subject", detail: "History" });
  });

  it("accepts a calculated percentage rounded to a whole number", () => {
    const result = validateExplanation("The student's Mathematics average is about 57%.", FACTS);
    expect(result.ok).toBe(true);
  });

  it("accepts spelled-out numbers only when they match the facts", () => {
    const allowed = validateExplanation(
      "The student attended nine out of ten recorded days.",
      PROGRESS_FACTS,
    );
    expect(allowed.ok).toBe(true);

    const wrong = validateExplanation(
      "The student attended fifty out of sixty recorded days.",
      PROGRESS_FACTS,
    );
    expect(wrong.ok).toBe(false);
    expect(wrong.issues).toContainEqual({ code: "wrong_number", detail: "fifty" });
  });
});

describe("AI explanation orchestration", () => {
  it("regenerates once and then falls back when the validator keeps rejecting", async () => {
    const provider = new MockAiProvider({ reply: "The student's average is 99%." });
    const limiter = new AiLimiter({ dailyLimit: 5 });

    const result = await explain(
      {
        guardianId: "p4-g1",
        language: "en",
        focus: "marks",
        marks: marksSummary,
        attendance: null,
      },
      { provider, limiter, logger: silentLogger, sleep: async () => {} },
    );

    expect(result.explanation).toBeNull();
    expect(result.reason).toBe("validator");
    // One reply plus exactly one regeneration.
    expect(provider.calls).toHaveLength(2);
  });

  it("accepts the regenerated reply after one rejection", async () => {
    let call = 0;
    const provider = new MockAiProvider({
      reply: () => {
        call += 1;
        return call === 1
          ? "The student's average is 99%."
          : "The student is improving in Mathematics. • Keep practising every day.";
      },
    });
    const limiter = new AiLimiter({ dailyLimit: 5 });

    const result = await explain(
      {
        guardianId: "p4-g1",
        language: "en",
        focus: "marks",
        marks: marksSummary,
        attendance: null,
      },
      { provider, limiter, logger: silentLogger, sleep: async () => {} },
    );

    expect(result.usedAi).toBe(true);
    expect(result.explanation).toContain("improving in Mathematics");
    expect(provider.calls).toHaveLength(2);
  });

  it("retries a 429 with backoff and then succeeds", async () => {
    const delays: number[] = [];
    let call = 0;
    const provider = new MockAiProvider({
      reply: () => {
        call += 1;
        if (call === 1) throw new Error("429 RESOURCE_EXHAUSTED");
        return "The student is doing steady work in Mathematics.";
      },
    });
    const limiter = new AiLimiter({ dailyLimit: 5 });

    const result = await explain(
      {
        guardianId: "p4-g1",
        language: "en",
        focus: "marks",
        marks: marksSummary,
        attendance: null,
      },
      {
        provider,
        limiter,
        logger: silentLogger,
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    );

    expect(result.usedAi).toBe(true);
    expect(provider.calls).toHaveLength(2);
    expect(delays).toEqual([500]);
  });

  it("gives up after the retry cap and falls back", async () => {
    const provider = new MockAiProvider({ error: new Error("429 RESOURCE_EXHAUSTED") });
    const limiter = new AiLimiter({ dailyLimit: 5 });

    const result = await explain(
      {
        guardianId: "p4-g1",
        language: "en",
        focus: "marks",
        marks: marksSummary,
        attendance: null,
      },
      { provider, limiter, logger: silentLogger, sleep: async () => {} },
    );

    expect(result.explanation).toBeNull();
    expect(result.reason).toBe("provider_error");
    expect(provider.calls).toHaveLength(3);
  });

  it("does not retry a non-retryable provider error", async () => {
    const provider = new MockAiProvider({ error: new Error("invalid argument") });
    const limiter = new AiLimiter({ dailyLimit: 5 });

    const result = await explain(
      {
        guardianId: "p4-g1",
        language: "en",
        focus: "marks",
        marks: marksSummary,
        attendance: null,
      },
      { provider, limiter, logger: silentLogger, sleep: async () => {} },
    );

    expect(result.reason).toBe("provider_error");
    expect(provider.calls).toHaveLength(1);
  });

  it("falls back when the AI is disabled", async () => {
    setAiProvider(null);

    const result = await answerQuestion(CHAT_G1, "How are the marks?");
    expect(result.kind).toBe("answer");
    // Exactly the Phase 3 deterministic answer.
    expect(result.text).toBe(marksReply({ name: "Aarav Four", class: "5A" }, marksSummary, "en"));
  });
});

describe("prompt pseudonymization", () => {
  it("sends no names, ids, chat ids or classes to the model", () => {
    const built = buildExplanationPrompt(PROGRESS_FACTS, "en");
    const all = `${built.systemInstruction}\n${built.prompt}`;

    expect(built.promptVersion).toBe(PROMPT_VERSION);
    expect(all).toContain("the student");
    expect(all).not.toContain("Aarav");
    expect(all).not.toContain("p4-s1");
    expect(all).not.toContain(CHAT_G1);
    expect(all).not.toContain("5A");
    expect(all).not.toMatch(/\b\d{9,}\b/); // no phone-number-like digit runs
  });
});

describe("routing and escalation", () => {
  it("answers 'How is my child doing in Maths?' with facts, explanation and source", async () => {
    const provider = new MockAiProvider({
      reply:
        "The student is improving in Mathematics and is steady in English. " +
        "• Keep practising a little every day. " +
        "• Praise the effort, not only the result.",
    });
    setAiProvider(provider);

    const result = await answerQuestion(CHAT_G1, "How is my child doing in Maths?");

    expect(result.kind).toBe("answer");
    expect(result.text).toContain("Mathematics: average 56.7% (improving)");
    expect(result.text).toContain("English: average 70% (steady)");
    expect(result.text).toContain("• Attendance: 90% (10 school days)");
    expect(result.text).toContain("The student is improving in Mathematics");
    expect(result.text).toContain(
      "Source: marks from 1 Oct 2026 – 10 Nov 2026 (3 tests per subject); attendance from",
    );
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.systemInstruction).toContain("Reply entirely in English");
  });

  it("keeps simple attendance and fee lookups deterministic (no AI call)", async () => {
    const provider = new MockAiProvider();
    setAiProvider(provider);

    const attendance = await answerQuestion(CHAT_G1, "What is my child's attendance?");
    const fees = await answerQuestion(CHAT_G1, "Are any fees due?");

    expect(attendance.text).toContain("Attendance for Aarav Four");
    expect(attendance.text).toContain("90%");
    expect(fees.kind).toBe("answer");
    expect(provider.calls).toHaveLength(0);
  });

  it("escalates a sensitive question in English and records it", async () => {
    const provider = new MockAiProvider();
    setAiProvider(provider);

    const result = await answerQuestion(CHAT_G1, "My child is being bullied at school");

    expect(result.kind).toBe("escalated");
    expect(result.text).toContain("a teacher will reply");
    expect(provider.calls).toHaveLength(0);

    const escalation = await prisma.escalation.findFirst({
      where: { institute_id: INST, guardian_id: "p4-g1", status: "open" },
      orderBy: { created_at: "desc" },
    });
    expect(escalation?.question).toBe("My child is being bullied at school");
    expect(escalation?.student_id).toBe("p4-s1");
  });

  it("escalates a sensitive question in Telugu", async () => {
    const result = await answerQuestion(CHAT_GTE, "నా పిల్లలను బెదిరిస్తున్నారు");

    expect(result.kind).toBe("escalated");
    expect(result.text).toContain("ఉపాధ్యాయుడు");

    const escalation = await prisma.escalation.findFirst({
      where: { institute_id: INST, guardian_id: "p4-gte", status: "open" },
      orderBy: { created_at: "desc" },
    });
    expect(escalation?.student_id).toBe("p4-s4");
  });

  it("escalates a health question without calling the AI", async () => {
    const provider = new MockAiProvider();
    setAiProvider(provider);

    const result = await answerQuestion(CHAT_G1, "My child has fever, is it serious?");

    expect(result.kind).toBe("escalated");
    expect(provider.calls).toHaveLength(0);
  });

  it("still refuses another parent's child for an AI explanation", async () => {
    const provider = new MockAiProvider();
    setAiProvider(provider);

    const result = await answerQuestionForStudent(CHAT_G1, "p4-s3", "marks");

    expect(result.kind).toBe("forbidden");
    expect(result.text).not.toContain("Other Four");
    expect(provider.calls).toHaveLength(0);
  });

  it("says honestly when marks are missing and does not call the AI", async () => {
    const provider = new MockAiProvider();
    setAiProvider(provider);

    const result = await answerQuestion(CHAT_G2, "How are Bhavya's marks?");

    expect(result.kind).toBe("no_data");
    expect(result.text).toContain("There are no marks records for Bhavya Four yet");
    expect(provider.calls).toHaveLength(0);
  });
});

describe("rate limits", () => {
  it("enforces a per-guardian daily AI limit and falls back to the template", async () => {
    const provider = new MockAiProvider();
    setAiProvider(provider);
    setAiLimiter(new AiLimiter({ dailyLimit: 1 }));

    const first = await answerQuestion(CHAT_G1, "How are the marks?");
    const second = await answerQuestion(CHAT_G1, "How is my child doing?");

    expect(provider.calls).toHaveLength(1);
    expect(first.text).toContain("The student is making steady progress");
    expect(second.text).toContain("Source: marks from 1 Oct 2026 – 10 Nov 2026");
    expect(second.text).not.toContain("The student is making steady progress");
  });

  it("counts each guardian separately", async () => {
    const provider = new MockAiProvider();
    setAiProvider(provider);
    setAiLimiter(new AiLimiter({ dailyLimit: 1 }));

    await answerQuestion(CHAT_G1, "How are the marks?");
    await answerQuestion(CHAT_GTE, "మార్కులు ఎలా ఉన్నాయి?");

    expect(provider.calls).toHaveLength(2);
  });

  it("resets the daily count on a new UTC day", () => {
    let now = new Date("2026-11-25T10:00:00.000Z");
    const limiter = new AiLimiter({ dailyLimit: 1, now: () => now });

    expect(limiter.consumeDaily("g1")).toBe(true);
    expect(limiter.consumeDaily("g1")).toBe(false);
    now = new Date("2026-11-26T00:01:00.000Z");
    expect(limiter.consumeDaily("g1")).toBe(true);
  });
});
