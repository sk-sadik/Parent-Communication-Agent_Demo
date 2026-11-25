import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma.js";
import { classifyQuestion } from "../src/services/classifier.js";
import {
  calculateTrend,
  latestRecordDate,
  summarizeAttendance,
  summarizeFees,
  summarizeMarks,
  type AttendanceEntry,
  type MarkEntry,
} from "../src/services/calculations.js";
import { formatAmount, formatDateRange, formatPercent } from "../src/services/format.js";
import { answerQuestion, answerQuestionForStudent } from "../src/services/answerService.js";
import { messages } from "../src/telegram/messages.js";

const INST_B = "inst-p3-b";
const INST_C = "inst-p3-c";

const CHAT_G1 = "p3-chat-g1"; // two children in institute B
const CHAT_G2 = "p3-chat-g2"; // one different child in institute B
const CHAT_GC = "p3-chat-gc"; // institute C
const CHAT_GTE = "p3-chat-gte"; // Telugu-speaking guardian
const CHAT_T = "p3-chat-t"; // teacher, class 5A

function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function resetFixtures(): Promise<void> {
  await prisma.institute.deleteMany({ where: { id: { in: [INST_B, INST_C] } } });

  await prisma.institute.createMany({
    data: [
      { id: INST_B, name: "Phase 3 Institute B (synthetic)" },
      { id: INST_C, name: "Phase 3 Institute C (synthetic)" },
    ],
  });

  await prisma.guardian.createMany({
    data: [
      { id: "p3-g1", institute_id: INST_B, name: "Phase Three Parent", language: "en", telegram_chat_id: CHAT_G1 },
      { id: "p3-g2", institute_id: INST_B, name: "Other Parent", language: "en", telegram_chat_id: CHAT_G2 },
      { id: "p3-gc", institute_id: INST_C, name: "Cross Parent", language: "en", telegram_chat_id: CHAT_GC },
      { id: "p3-gte", institute_id: INST_B, name: "Telugu Parent", language: "te", telegram_chat_id: CHAT_GTE },
    ],
  });

  await prisma.teacher.createMany({
    data: [
      { id: "p3-t1", institute_id: INST_B, name: "Phase Three Teacher", assigned_class: "5A", telegram_chat_id: CHAT_T },
    ],
  });

  await prisma.student.createMany({
    data: [
      { id: "p3-s1", institute_id: INST_B, name: "Aarav Test", class: "5A", roll_number: "5A-01" },
      { id: "p3-s2", institute_id: INST_B, name: "Bhavya Test", class: "5A", roll_number: "5A-02" },
      { id: "p3-s3", institute_id: INST_B, name: "Other Test", class: "5A", roll_number: "5A-03" },
      { id: "p3-s4", institute_id: INST_B, name: "Telugu Test", class: "5A", roll_number: "5A-04" },
      { id: "p3-sc", institute_id: INST_C, name: "Cross Test", class: "8C", roll_number: "8C-01" },
    ],
  });

  await prisma.guardianStudentLink.createMany({
    data: [
      { id: "p3-l1", institute_id: INST_B, guardian_id: "p3-g1", student_id: "p3-s1", relationship: "mother", verified: true },
      { id: "p3-l2", institute_id: INST_B, guardian_id: "p3-g1", student_id: "p3-s2", relationship: "mother", verified: true },
      { id: "p3-l3", institute_id: INST_B, guardian_id: "p3-g2", student_id: "p3-s3", relationship: "father", verified: true },
      { id: "p3-l4", institute_id: INST_B, guardian_id: "p3-gte", student_id: "p3-s4", relationship: "mother", verified: true },
      { id: "p3-lc", institute_id: INST_C, guardian_id: "p3-gc", student_id: "p3-sc", relationship: "mother", verified: true },
    ],
  });

  const attendance = [
    // Aarav: 10 school days, 8 present, 1 late, 1 absent -> 90%.
    { id: "p3-a1", student_id: "p3-s1", date: "2026-11-02", status: "present" as const },
    { id: "p3-a2", student_id: "p3-s1", date: "2026-11-03", status: "present" as const },
    { id: "p3-a3", student_id: "p3-s1", date: "2026-11-04", status: "present" as const },
    { id: "p3-a4", student_id: "p3-s1", date: "2026-11-05", status: "present" as const },
    { id: "p3-a5", student_id: "p3-s1", date: "2026-11-06", status: "present" as const },
    { id: "p3-a6", student_id: "p3-s1", date: "2026-11-09", status: "present" as const },
    { id: "p3-a7", student_id: "p3-s1", date: "2026-11-10", status: "present" as const },
    { id: "p3-a8", student_id: "p3-s1", date: "2026-11-11", status: "present" as const },
    { id: "p3-a9", student_id: "p3-s1", date: "2026-11-12", status: "late" as const },
    { id: "p3-a10", student_id: "p3-s1", date: "2026-11-13", status: "absent" as const },
    // Bhavya: attendance only, no marks or fees.
    { id: "p3-b1", student_id: "p3-s2", date: "2026-11-12", status: "present" as const },
    { id: "p3-b2", student_id: "p3-s2", date: "2026-11-13", status: "present" as const },
    // Other family's child.
    { id: "p3-o1", student_id: "p3-s3", date: "2026-11-13", status: "absent" as const },
    // Telugu child: 2 present, 1 absent -> 66.7%.
    { id: "p3-t1", student_id: "p3-s4", date: "2026-11-11", status: "present" as const },
    { id: "p3-t2", student_id: "p3-s4", date: "2026-11-12", status: "present" as const },
    { id: "p3-t3", student_id: "p3-s4", date: "2026-11-13", status: "absent" as const },
    // Institute C child.
    { id: "p3-c1", student_id: "p3-sc", date: "2026-11-13", status: "present" as const },
  ];

  await prisma.attendance.createMany({
    data: attendance.map((row) => ({
      id: row.id,
      institute_id: row.student_id === "p3-sc" ? INST_C : INST_B,
      student_id: row.student_id,
      date: day(row.date),
      status: row.status,
    })),
  });

  await prisma.mark.createMany({
    data: [
      { id: "p3-m1", institute_id: INST_B, student_id: "p3-s1", subject: "Mathematics", test_name: "Unit Test 1", score: 40, max_score: 100, date: day("2026-10-01") },
      { id: "p3-m2", institute_id: INST_B, student_id: "p3-s1", subject: "Mathematics", test_name: "Unit Test 2", score: 50, max_score: 100, date: day("2026-10-15") },
      { id: "p3-m3", institute_id: INST_B, student_id: "p3-s1", subject: "Mathematics", test_name: "Unit Test 3", score: 80, max_score: 100, date: day("2026-11-10") },
      { id: "p3-m4", institute_id: INST_B, student_id: "p3-s1", subject: "English", test_name: "Unit Test 1", score: 70, max_score: 100, date: day("2026-10-01") },
      { id: "p3-m5", institute_id: INST_B, student_id: "p3-s1", subject: "English", test_name: "Unit Test 2", score: 70, max_score: 100, date: day("2026-10-15") },
      { id: "p3-m6", institute_id: INST_B, student_id: "p3-s1", subject: "English", test_name: "Unit Test 3", score: 70, max_score: 100, date: day("2026-11-10") },
    ],
  });

  await prisma.fee.createMany({
    data: [
      { id: "p3-f1", institute_id: INST_B, student_id: "p3-s1", amount: 4500, due_date: day("2026-09-15"), paid: false },
      { id: "p3-f2", institute_id: INST_B, student_id: "p3-s1", amount: 4500, due_date: day("2026-12-15"), paid: false },
      { id: "p3-f3", institute_id: INST_B, student_id: "p3-s1", amount: 4500, due_date: day("2026-06-15"), paid: true },
    ],
  });

  await prisma.announcement.createMany({
    data: [
      { id: "p3-ann1", institute_id: INST_B, class: "5A", text: "Annual sports day is on 12 December.", status: "approved", created_by_teacher_id: "p3-t1" },
      { id: "p3-ann2", institute_id: INST_B, class: "5A", text: "Draft notice: not approved", status: "draft", created_by_teacher_id: "p3-t1" },
      { id: "p3-ann3", institute_id: INST_B, class: "6A", text: "Other class notice", status: "approved", created_by_teacher_id: "p3-t1" },
      { id: "p3-ann4", institute_id: INST_C, class: "8C", text: "Cross institute notice", status: "approved", created_by_teacher_id: "p3-t1" },
    ],
  });
}

beforeAll(async () => {
  await resetFixtures();
});

afterAll(async () => {
  await prisma.institute.deleteMany({ where: { id: { in: [INST_B, INST_C] } } });
  await prisma.$disconnect();
});

describe("calculations", () => {
  it("calculates attendance percentage from recorded school days", () => {
    const records: AttendanceEntry[] = [
      { date: day("2026-11-02"), status: "present" },
      { date: day("2026-11-03"), status: "present" },
      { date: day("2026-11-04"), status: "late" },
      { date: day("2026-11-05"), status: "absent" },
    ];

    const summary = summarizeAttendance(records);
    expect(summary).not.toBeNull();
    expect(summary?.percentage).toBe(75);
    expect(summary?.present).toBe(2);
    expect(summary?.late).toBe(1);
    expect(summary?.absent).toBe(1);
    expect(summary?.attendedDays).toBe(3);
    expect(summary?.recordedDays).toBe(4);
    // Anchored to the newest record, never the machine clock.
    expect(summary?.to.toISOString().slice(0, 10)).toBe("2026-11-05");
  });

  it("returns null when there are no attendance records", () => {
    expect(summarizeAttendance([])).toBeNull();
  });

  it("averages subjects and derives a trend from the test sequence", () => {
    const marks: MarkEntry[] = [
      { subject: "Mathematics", test_name: "T1", score: 40, max_score: 100, date: day("2026-10-01") },
      { subject: "Mathematics", test_name: "T2", score: 50, max_score: 100, date: day("2026-10-15") },
      { subject: "Mathematics", test_name: "T3", score: 80, max_score: 100, date: day("2026-11-10") },
      { subject: "English", test_name: "T1", score: 70, max_score: 100, date: day("2026-10-01") },
      { subject: "English", test_name: "T2", score: 70, max_score: 100, date: day("2026-10-15") },
    ];

    const summary = summarizeMarks(marks);
    expect(summary).not.toBeNull();
    const maths = summary?.subjects.find((subject) => subject.subject === "Mathematics");
    const english = summary?.subjects.find((subject) => subject.subject === "English");
    expect(maths?.average).toBe(56.7);
    expect(maths?.trend).toBe("up");
    expect(english?.average).toBe(70);
    expect(english?.trend).toBe("flat");
    expect(summary?.from.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(summary?.to.toISOString().slice(0, 10)).toBe("2026-11-10");
  });

  it("treats small score movements as flat and fewer than two tests as flat", () => {
    expect(calculateTrend([70, 71])).toBe("flat");
    expect(calculateTrend([70])).toBe("flat");
    expect(calculateTrend([70, 65])).toBe("down");
  });

  it("totals unpaid fees and judges overdue against the reference date", () => {
    const fees = [
      { amount: 4500, due_date: day("2026-09-15"), paid: false },
      { amount: 4500, due_date: day("2026-12-15"), paid: false },
      { amount: 4500, due_date: day("2026-06-15"), paid: true },
    ];

    const summary = summarizeFees(fees, day("2026-11-13"));
    expect(summary.totalDue).toBe(9000);
    expect(summary.overdueAmount).toBe(4500);
    expect(summary.overdueCount).toBe(1);
    expect(summary.hasOverdue).toBe(true);
    expect(summary.nextDueDate?.toISOString().slice(0, 10)).toBe("2026-12-15");

    const noReference = summarizeFees(fees, null);
    expect(noReference.hasOverdue).toBe(false);
    expect(noReference.totalDue).toBe(9000);
  });

  it("picks the latest record date across attendance and marks", () => {
    const latest = latestRecordDate(
      [{ date: day("2026-11-13"), status: "absent" }],
      [{ date: day("2026-11-10"), subject: "Maths", test_name: "T3", score: 1, max_score: 1 }],
    );
    expect(latest?.toISOString().slice(0, 10)).toBe("2026-11-13");
  });

  it("formats dates, percentages and amounts for both languages", () => {
    const range = formatDateRange(day("2026-11-02"), day("2026-11-13"), "en");
    expect(range).toBe("2 Nov 2026 – 13 Nov 2026");
    expect(formatDateRange(day("2026-11-02"), day("2026-11-13"), "te")).toContain("నవంబర్");
    expect(formatPercent(90)).toBe("90%");
    expect(formatPercent(66.66)).toBe("66.7%");
    expect(formatAmount(9000)).toBe("₹9,000");
    expect(formatAmount(450000)).toBe("₹4,50,000");
  });
});

describe("question classifier", () => {
  it("classifies English questions", () => {
    expect(classifyQuestion("What is my child's attendance?")).toBe("attendance");
    expect(classifyQuestion("How are the marks in maths?")).toBe("marks");
    expect(classifyQuestion("Are there any fees due?")).toBe("fees");
    expect(classifyQuestion("Any announcements for the class?")).toBe("announcements");
    expect(classifyQuestion("is there any announcemnts today?")).toBe("announcements");
    expect(classifyQuestion("how is my ward studying")).toBe("marks");
    expect(classifyQuestion("Can you call me, please?")).toBe("other");
  });

  it("classifies Telugu script questions", () => {
    expect(classifyQuestion("నా పిల్లల హాజరు ఎలా ఉంది?")).toBe("attendance");
    expect(classifyQuestion("మార్కులు ఎలా ఉన్నాయి?")).toBe("marks");
    expect(classifyQuestion("ఫీజు బాకీ ఉందా?")).toBe("fees");
    expect(classifyQuestion("తరగతికి ప్రకటనలు ఉన్నాయా?")).toBe("announcements");
  });

  it("classifies simple transliterated Telugu", () => {
    expect(classifyQuestion("naa pillala hajaru ela undi?")).toBe("attendance");
    expect(classifyQuestion("markulu ela unnayi?")).toBe("marks");
    expect(classifyQuestion("fee baaki unda?")).toBe("fees");
    expect(classifyQuestion("prakatana unda?")).toBe("announcements");
  });

  it("falls back to other for empty or unrelated text", () => {
    expect(classifyQuestion("")).toBe("other");
    expect(classifyQuestion("hello")).toBe("other");
  });
});

describe("answer service", () => {
  it("asks which child when the guardian has several and none is named", async () => {
    const result = await answerQuestion(CHAT_G1, "What is my child's attendance?");

    expect(result.kind).toBe("choose_child");
    expect(result.category).toBe("attendance");
    expect(result.options?.map((option) => option.studentId).sort()).toEqual(["p3-s1", "p3-s2"]);
  });

  it("answers attendance with a calculated percentage and the date range", async () => {
    const result = await answerQuestion(CHAT_G1, "What is Aarav's attendance?");

    expect(result.kind).toBe("answer");
    expect(result.studentId).toBe("p3-s1");
    expect(result.text).toContain("Attendance for Aarav Test (class 5A)");
    expect(result.text).toContain("Based on attendance records from 2 Nov 2026 – 13 Nov 2026");
    expect(result.text).toContain("10 school days");
    expect(result.text).toContain("Attended 9 days (90%)");
    expect(result.text).toContain("Present: 8, Late: 1, Absent: 1");
  });

  it("answers the same attendance question in Telugu", async () => {
    const result = await answerQuestion(CHAT_GTE, "నా పిల్లల హాజరు ఎలా ఉంది?");

    expect(result.kind).toBe("answer");
    expect(result.text).toContain("హాజరు");
    expect(result.text).toContain("66.7%");
    expect(result.text).toContain("నవంబర్ 2026");
  });

  it("answers marks with subject averages and a trend", async () => {
    const result = await answerQuestion(CHAT_G1, "How are Aarav's marks?");

    expect(result.kind).toBe("answer");
    expect(result.text).toContain("Marks for Aarav Test");
    expect(result.text).toContain("Based on marks from 1 Oct 2026 – 10 Nov 2026");
    expect(result.text).toContain("Mathematics: average 56.7% (improving)");
    expect(result.text).toContain("English: average 70% (steady)");
  });

  it("answers fees with unpaid total, next due date and overdue status", async () => {
    const result = await answerQuestion(CHAT_G1, "Are any fees due for Aarav?");

    expect(result.kind).toBe("answer");
    expect(result.text).toContain("Total unpaid: ₹9,000");
    expect(result.text).toContain("Next due date: 15 Dec 2026");
    expect(result.text).toContain("Overdue: ₹4,500 (1 payment past the due date)");
  });

  it("shows only approved announcements for the child's own class", async () => {
    const result = await answerQuestion(CHAT_G1, "Any announcements for Aarav?");

    expect(result.kind).toBe("answer");
    expect(result.text).toContain("Annual sports day is on 12 December.");
    expect(result.text).not.toContain("Draft notice");
    expect(result.text).not.toContain("Other class notice");
    expect(result.text).not.toContain("Cross institute notice");
  });

  it("keeps cross-institute announcements isolated", async () => {
    const result = await answerQuestion(CHAT_GC, "Any announcements?");

    expect(result.kind).toBe("answer");
    expect(result.text).toContain("Cross institute notice");
    expect(result.text).not.toContain("Annual sports day");
  });

  it("says honestly when marks data is missing", async () => {
    const result = await answerQuestion(CHAT_G1, "How are Bhavya's marks?");

    expect(result.kind).toBe("no_data");
    expect(result.text).toContain("There are no marks records for Bhavya Test yet");
    // No invented number, no other child's data.
    expect(result.text).not.toContain("56.7%");
    expect(result.text).not.toContain("Aarav");
  });

  it("does not let a parent read another parent's child", async () => {
    const result = await answerQuestionForStudent(CHAT_G1, "p3-s3", "attendance");

    expect(result.kind).toBe("forbidden");
    expect(result.text).toBe(messages.notAllowed("en"));
    expect(result.text).not.toContain("Other Test");
    expect(result.text).not.toContain("absent");
  });

  it("answers a selected child from callback data", async () => {
    const result = await answerQuestionForStudent(CHAT_G1, "p3-s1", "attendance");

    expect(result.kind).toBe("answer");
    expect(result.text).toContain("Aarav Test");
    expect(result.text).toContain("90%");
  });

  it("tells the guardian that other questions go to the teacher", async () => {
    const result = await answerQuestion(CHAT_G1, "Can you call me?");

    expect(result.kind).toBe("other");
    expect(result.text).toContain("please contact your child's teacher");
    expect(result.text).toContain("not available in this demo yet");
  });

  it("returns a polite message for an unknown chat and no data for teachers", async () => {
    const unknown = await answerQuestion("p3-chat-nobody", "What is my child's attendance?");
    expect(unknown.kind).toBe("unknown");
    expect(unknown.text).toBe(messages.unknownChat());

    const teacher = await answerQuestion(CHAT_T, "What is my child's attendance?");
    expect(teacher.kind).toBe("teacher");
  });

  it("writes questions, answers and denials to the audit log", async () => {
    const questions = await prisma.auditLog.count({
      where: { institute_id: INST_B, actor_id: "p3-g1", action: "question.received" },
    });
    const answers = await prisma.auditLog.count({
      where: { institute_id: INST_B, actor_id: "p3-g1", action: "answer.sent" },
    });
    const denied = await prisma.auditLog.count({
      where: { institute_id: INST_B, actor_id: "p3-g1", action: "answer.denied" },
    });

    expect(questions).toBeGreaterThan(0);
    expect(answers).toBeGreaterThan(0);
    expect(denied).toBe(1);
  });
});
