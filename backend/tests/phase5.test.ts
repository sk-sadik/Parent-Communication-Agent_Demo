import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockAiProvider } from "../src/ai/mockProvider.js";
import { setAiProvider } from "../src/ai/runtime.js";
import { validateAnnouncementRewrite } from "../src/ai/announcementValidator.js";
import {
  resolveActorByChatId,
  resolveTeacherCommand,
  type ResolvedTeacher,
} from "../src/services/authorizationService.js";
import {
  approveAndDeliverAnnouncement,
  createAnnouncementDraft,
  editAnnouncementDraft,
  getEditableDraft,
  rejectAnnouncementDraft,
} from "../src/services/announcementService.js";
import { prisma } from "../src/db/prisma.js";
import {
  getOpenEscalationForTeacher,
  listOpenEscalations,
  notifyEscalationTeacher,
  replyToEscalation,
} from "../src/services/escalationWorkflowService.js";
import { triggerFeeReminders } from "../src/services/feeReminderService.js";
import { FakeNotificationChannel } from "./fakeChannel.js";

const INST = "inst-test-p5";

const CHAT_TEACHER_A = "p5-teacher-a";
const CHAT_TEACHER_B = "p5-teacher-b";
const CHAT_GUARDIAN_1 = "p5-guardian-1"; // en, fee contact for stu1 and stu4
const CHAT_GUARDIAN_2 = "p5-guardian-2"; // te, fee contact for stu2
const CHAT_GUARDIAN_4 = "p5-guardian-4"; // linked to stu1 but NOT a fee contact
const CHAT_GUARDIAN_5 = "p5-guardian-5"; // 7B, must never be touched by teacher A

const ASSIGNED_CLASS = "7A";
const OTHER_CLASS = "7B";

function ui(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

async function resetFixtures(): Promise<void> {
  await prisma.institute.deleteMany({ where: { id: INST } });

  await prisma.institute.create({
    data: { id: INST, name: "Phase 5 Test Institute (synthetic)" },
  });

  await prisma.teacher.createMany({
    data: [
      {
        id: "tch-p5-a",
        institute_id: INST,
        name: "Test Teacher A",
        assigned_class: ASSIGNED_CLASS,
        telegram_chat_id: CHAT_TEACHER_A,
      },
      {
        id: "tch-p5-b",
        institute_id: INST,
        name: "Test Teacher B",
        assigned_class: OTHER_CLASS,
        telegram_chat_id: CHAT_TEACHER_B,
      },
    ],
  });

  await prisma.student.createMany({
    data: [
      { id: "stu-p5-1", institute_id: INST, name: "Ravi Kumar", class: ASSIGNED_CLASS, roll_number: "7A-01" },
      { id: "stu-p5-2", institute_id: INST, name: "Meena Rao", class: ASSIGNED_CLASS, roll_number: "7A-02" },
      { id: "stu-p5-3", institute_id: INST, name: "Sara Khan", class: ASSIGNED_CLASS, roll_number: "7A-03" },
      { id: "stu-p5-4", institute_id: INST, name: "Arjun Das", class: ASSIGNED_CLASS, roll_number: "7A-04" },
      { id: "stu-p5-5", institute_id: INST, name: "Bina Patel", class: OTHER_CLASS, roll_number: "7B-01" },
    ],
  });

  await prisma.guardian.createMany({
    data: [
      { id: "gdn-p5-1", institute_id: INST, name: "Ravi Parent", language: "en", telegram_chat_id: CHAT_GUARDIAN_1 },
      { id: "gdn-p5-2", institute_id: INST, name: "Meena Parent", language: "te", telegram_chat_id: CHAT_GUARDIAN_2 },
      // Linked in the school records but never linked Telegram.
      { id: "gdn-p5-3", institute_id: INST, name: "Sara Parent", language: "en", telegram_chat_id: null },
      { id: "gdn-p5-4", institute_id: INST, name: "Other Parent", language: "en", telegram_chat_id: CHAT_GUARDIAN_4 },
      { id: "gdn-p5-5", institute_id: INST, name: "Bina Parent", language: "en", telegram_chat_id: CHAT_GUARDIAN_5 },
    ],
  });

  await prisma.guardianStudentLink.createMany({
    data: [
      { id: "lnk-p5-1", institute_id: INST, guardian_id: "gdn-p5-1", student_id: "stu-p5-1", relationship: "mother", is_fee_contact: true, verified: true },
      { id: "lnk-p5-2", institute_id: INST, guardian_id: "gdn-p5-1", student_id: "stu-p5-4", relationship: "mother", is_fee_contact: true, verified: true },
      { id: "lnk-p5-3", institute_id: INST, guardian_id: "gdn-p5-2", student_id: "stu-p5-2", relationship: "father", is_fee_contact: true, verified: true },
      { id: "lnk-p5-4", institute_id: INST, guardian_id: "gdn-p5-3", student_id: "stu-p5-3", relationship: "mother", is_fee_contact: true, verified: true },
      { id: "lnk-p5-5", institute_id: INST, guardian_id: "gdn-p5-4", student_id: "stu-p5-1", relationship: "father", is_fee_contact: false, verified: true },
      { id: "lnk-p5-6", institute_id: INST, guardian_id: "gdn-p5-5", student_id: "stu-p5-5", relationship: "mother", is_fee_contact: true, verified: true },
    ],
  });

  await prisma.fee.createMany({
    data: [
      { id: "fee-p5-1", institute_id: INST, student_id: "stu-p5-1", amount: 1500, due_date: ui("2026-11-28"), paid: false },
      { id: "fee-p5-2", institute_id: INST, student_id: "stu-p5-1", amount: 500, due_date: ui("2026-12-10"), paid: false },
      { id: "fee-p5-3", institute_id: INST, student_id: "stu-p5-2", amount: 800, due_date: ui("2026-11-30"), paid: false },
      { id: "fee-p5-4", institute_id: INST, student_id: "stu-p5-3", amount: 500, due_date: ui("2026-12-01"), paid: false },
      { id: "fee-p5-5", institute_id: INST, student_id: "stu-p5-4", amount: 1000, due_date: ui("2026-11-20"), paid: true },
      { id: "fee-p5-6", institute_id: INST, student_id: "stu-p5-5", amount: 700, due_date: ui("2026-12-05"), paid: false },
    ],
  });
}

async function teacher(chatId: string): Promise<ResolvedTeacher> {
  const actor = await resolveActorByChatId(chatId);
  if (!actor || actor.kind !== "teacher") throw new Error("expected a teacher actor");
  return actor;
}

async function createDraft(text: string, chatId = CHAT_TEACHER_A) {
  const actor = await teacher(chatId);
  const result = await createAnnouncementDraft(actor, text);
  if (!result.ok) throw new Error(`draft failed: ${result.reason}`);
  return result.draft;
}

async function createOpenEscalation(
  guardianId: string,
  studentId: string,
  question: string,
): Promise<string> {
  const id = randomUUID();
  await prisma.escalation.create({
    data: {
      id,
      institute_id: INST,
      guardian_id: guardianId,
      student_id: studentId,
      question,
      status: "open",
    },
  });
  return id;
}

// A pass-through "AI" that returns the teacher's text unchanged. Tests that
// need bad wording replace this provider explicitly.
const passThroughReply = (request: { prompt: string }): string =>
  request.prompt.split('"""')[1]?.trim() ?? "Announcement";

beforeAll(async () => {
  await resetFixtures();
  setAiProvider(new MockAiProvider({ reply: passThroughReply }));
});

afterAll(async () => {
  setAiProvider(new MockAiProvider());
  await prisma.institute.deleteMany({ where: { id: INST } });
  await prisma.$disconnect();
});

describe("announcement validator", () => {
  const original =
    "The annual day is on 28 November 2026 at 5 pm in the school hall. The chief guest is Ravi Kumar.";

  it("accepts wording changes that keep every date, time, number and name", () => {
    const result = validateAnnouncementRewrite(
      original,
      "Please join us for the annual day on 28 November 2026 at 5 pm in the school hall. Our chief guest is Ravi Kumar.",
    );
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("rejects a changed date", () => {
    const result = validateAnnouncementRewrite(
      original,
      "The annual day is on 29 November 2026 at 5 pm in the school hall. The chief guest is Ravi Kumar.",
    );
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("changed_date");
  });

  it("rejects a changed time", () => {
    const result = validateAnnouncementRewrite(
      original,
      "The annual day is on 28 November 2026 at 6 pm in the school hall. The chief guest is Ravi Kumar.",
    );
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("changed_time");
  });

  it("rejects a changed number", () => {
    const result = validateAnnouncementRewrite(
      "The fee is 1,500 rupees and the deadline is 28 November 2026.",
      "The fee is 1,800 rupees and the deadline is 28 November 2026.",
    );
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("changed_number");
  });

  it("rejects an invented name", () => {
    const result = validateAnnouncementRewrite(
      original,
      "The annual day is on 28 November 2026 at 5 pm in the school hall. The chief guest is Rahul Kumar.",
    );
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("changed_name");
  });
});

describe("announcement workflow", () => {
  const channel = new FakeNotificationChannel();

  it("does not deliver a draft before approval", async () => {
    const draft = await createDraft("Sports day will be held on the school ground.");
    channel.reset();

    const stored = await prisma.announcement.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored.status).toBe("draft");
    expect(stored.delivered_at).toBeNull();
    expect(channel.guardianSends).toHaveLength(0);
  });

  it("delivers only to linked guardians of the class, and approving twice sends once", async () => {
    const draft = await createDraft("Parents meeting is on 28 November 2026 at 5 pm.");
    channel.reset();

    const actor = await teacher(CHAT_TEACHER_A);
    const first = await approveAndDeliverAnnouncement(actor, draft.id, channel);

    expect(first).toEqual({
      ok: true,
      alreadyDelivered: false,
      sent: 3,
      skippedUnlinked: 1,
      failed: 0,
    });

    const recipients = channel.guardianSends.map((send) => send.recipientId).sort();
    expect(recipients).toEqual(["gdn-p5-1", "gdn-p5-2", "gdn-p5-4"]);
    expect(recipients).not.toContain("gdn-p5-3"); // no Telegram
    expect(recipients).not.toContain("gdn-p5-5"); // another class

    const second = await approveAndDeliverAnnouncement(actor, draft.id, channel);
    expect(second).toEqual({
      ok: true,
      alreadyDelivered: true,
      sent: 0,
      skippedUnlinked: 0,
      failed: 0,
    });
    expect(channel.guardianSends).toHaveLength(3);
  });

  it("never delivers a rejected announcement", async () => {
    const draft = await createDraft("The library will close early this Friday.");
    const actor = await teacher(CHAT_TEACHER_A);
    channel.reset();

    await expect(rejectAnnouncementDraft(actor, draft.id)).resolves.toEqual({ ok: true });
    await expect(
      approveAndDeliverAnnouncement(actor, draft.id, channel),
    ).resolves.toEqual({ ok: false, reason: "rejected" });

    expect(channel.guardianSends).toHaveLength(0);
    const stored = await prisma.announcement.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored.status).toBe("rejected");
  });

  it("lets a teacher edit a draft, and audits the edit", async () => {
    const draft = await createDraft("Original text for the class.");
    const actor = await teacher(CHAT_TEACHER_A);

    await expect(getEditableDraft(actor, draft.id)).resolves.toMatchObject({
      ok: true,
      draft: { id: draft.id, class: ASSIGNED_CLASS },
    });

    const edited = await editAnnouncementDraft(
      actor,
      draft.id,
      "Replacement text for the class meeting.",
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.draft.text).toContain("Replacement text");

    const audits = await prisma.auditLog.count({
      where: {
        institute_id: INST,
        action: "announcement.edited",
        actor_id: "tch-p5-a",
      },
    });
    expect(audits).toBeGreaterThan(0);
  });

  it("refuses another teacher's class for approval, editing and rejection", async () => {
    const draft = await createDraft("Class 7A only announcement.");
    const other = await teacher(CHAT_TEACHER_B);
    channel.reset();

    await expect(
      approveAndDeliverAnnouncement(other, draft.id, channel),
    ).resolves.toEqual({ ok: false, reason: "wrong_class" });
    await expect(editAnnouncementDraft(other, draft.id, "Changed")).resolves.toEqual({
      ok: false,
      reason: "wrong_class",
    });
    await expect(rejectAnnouncementDraft(other, draft.id)).resolves.toEqual({
      ok: false,
      reason: "wrong_class",
    });
    await expect(getEditableDraft(other, draft.id)).resolves.toEqual({
      ok: false,
      reason: "wrong_class",
    });
    expect(channel.guardianSends).toHaveLength(0);
  });

  it("refuses teacher commands for a parent", async () => {
    await expect(resolveTeacherCommand(CHAT_GUARDIAN_1)).resolves.toEqual({
      ok: false,
      reason: "not_teacher",
    });
    await expect(resolveTeacherCommand("p5-unknown-chat")).resolves.toEqual({
      ok: false,
      reason: "unknown_chat",
    });
  });

  it("falls back to the teacher's original when the AI changes a date or number", async () => {
    const original =
      "The annual day is on 28 November 2026 at 5 pm. The entry fee is 200 rupees.";
    setAiProvider(
      new MockAiProvider({
        reply:
          "The annual day is on 29 November 2026 at 5 pm. The entry fee is 300 rupees.",
      }),
    );

    try {
      const draft = await createDraft(original);
      expect(draft.text).toBe(original);
      expect(draft.usedAi).toBe(false);
    } finally {
      setAiProvider(new MockAiProvider({ reply: passThroughReply }));
    }
  });

  it("still creates a draft when the AI is disabled", async () => {
    const original = "The school will remain closed on Friday.";
    setAiProvider(null);

    try {
      const draft = await createDraft(original);
      expect(draft.text).toBe(original);
      expect(draft.usedAi).toBe(false);
    } finally {
      setAiProvider(new MockAiProvider({ reply: passThroughReply }));
    }
  });
});

describe("fee reminders", () => {
  const channel = new FakeNotificationChannel();

  it("messages only linked fee contacts, skips no-dues students and never duplicates", async () => {
    const actor = await teacher(CHAT_TEACHER_A);
    channel.reset();

    const first = await triggerFeeReminders(actor, channel);
    expect(first.sent).toBe(2);
    expect(first.sentFees).toBe(3);
    expect(first.students).toBe(4);
    expect(first.skipped.no_telegram).toBe(1);
    expect(first.skipped.no_dues).toBe(1);

    const recipients = channel.guardianSends.map((send) => send.recipientId).sort();
    expect(recipients).toEqual(["gdn-p5-1", "gdn-p5-2"]);
    expect(recipients).not.toContain("gdn-p5-4"); // linked, but not the fee contact
    expect(recipients).not.toContain("gdn-p5-5"); // another class
    expect(recipients).not.toContain("gdn-p5-3"); // no Telegram

    // The Telugu guardian gets the Telugu reminder.
    const telugu = channel.guardianSends.find((send) => send.recipientId === "gdn-p5-2");
    expect(telugu?.message).toContain("ఫీజు గుర్తుచేయడం");

    const beforeSecondRun = channel.guardianSends.length;
    const second = await triggerFeeReminders(actor, channel);

    expect(second.sent).toBe(0);
    expect(second.sentFees).toBe(0);
    expect(second.skipped.already_sent).toBe(2);
    expect(second.skipped.no_telegram).toBe(1);
    expect(second.skipped.no_dues).toBe(1);
    expect(channel.guardianSends).toHaveLength(beforeSecondRun);
  });
});

describe("escalations", () => {
  const channel = new FakeNotificationChannel();

  it("notifies only the teacher of the student's class", async () => {
    channel.reset();
    const escalationId = await createOpenEscalation(
      "gdn-p5-1",
      "stu-p5-1",
      "My child says he is being bullied in class.",
    );

    const result = await notifyEscalationTeacher(escalationId, channel);
    expect(result.notified).toBe(true);
    expect(result.teacherId).toBe("tch-p5-a");

    expect(channel.teacherSends).toHaveLength(1);
    const send = channel.teacherSends[0];
    expect(send?.recipientId).toBe("tch-p5-a");
    expect(send?.message).toContain("Ravi Kumar");
    expect(send?.message).toContain("bullied");
    expect(send?.options?.inlineKeyboard?.[0]?.[0]?.callback_data).toBe(
      `esc:reply:${escalationId}`,
    );
  });

  it("lists open escalations for the class only", async () => {
    const actorA = await teacher(CHAT_TEACHER_A);
    const actorB = await teacher(CHAT_TEACHER_B);

    const open = await listOpenEscalations(actorA);
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((row) => row.studentClass === ASSIGNED_CLASS)).toBe(true);

    await expect(listOpenEscalations(actorB)).resolves.toEqual([]);
  });

  it("relays a teacher reply to the correct parent only and closes the escalation", async () => {
    const escalationId = await createOpenEscalation(
      "gdn-p5-1",
      "stu-p5-1",
      "We need help with reading practice at home.",
    );
    const actorA = await teacher(CHAT_TEACHER_A);
    const actorB = await teacher(CHAT_TEACHER_B);
    channel.reset();

    await expect(
      replyToEscalation(actorB, escalationId, "Wrong class reply", channel),
    ).resolves.toEqual({ ok: false, reason: "wrong_class" });
    expect(channel.guardianSends).toHaveLength(0);

    await expect(
      replyToEscalation(actorA, escalationId, "Please practise reading for 15 minutes daily.", channel),
    ).resolves.toEqual({ ok: true });

    expect(channel.guardianSends).toHaveLength(1);
    const send = channel.guardianSends[0];
    expect(send?.recipientId).toBe("gdn-p5-1");
    expect(send?.message).toContain("Reply from Test Teacher A");
    expect(send?.message).toContain("15 minutes daily");

    const stored = await prisma.escalation.findUniqueOrThrow({ where: { id: escalationId } });
    expect(stored.status).toBe("closed");
    expect(stored.teacher_reply).toContain("practise reading");

    // A second reply must not reach the parent again.
    await expect(
      replyToEscalation(actorA, escalationId, "Second reply", channel),
    ).resolves.toEqual({ ok: false, reason: "closed" });
    expect(channel.guardianSends).toHaveLength(1);

    await expect(getOpenEscalationForTeacher(actorA, escalationId)).resolves.toBeNull();
  });

  it("uses the parent's saved language for the teacher reply", async () => {
    const escalationId = await createOpenEscalation(
      "gdn-p5-2",
      "stu-p5-2",
      "మార్కుల గురించి సహాయం కావాలి.",
    );
    const actorA = await teacher(CHAT_TEACHER_A);
    channel.reset();

    await expect(
      replyToEscalation(actorA, escalationId, "We will share a practice plan.", channel),
    ).resolves.toEqual({ ok: true });

    expect(channel.guardianSends).toHaveLength(1);
    expect(channel.guardianSends[0]?.recipientId).toBe("gdn-p5-2");
    expect(channel.guardianSends[0]?.message).toContain("గారి సమాధానం");
  });
});

describe("audit log", () => {
  it("records every Phase 5 action", async () => {
    const rows = await prisma.auditLog.findMany({
      where: { institute_id: INST },
      select: { action: true },
      distinct: ["action"],
    });
    const actions = new Set(rows.map((row) => row.action));

    for (const action of [
      "announcement.draft",
      "announcement.edited",
      "announcement.approved",
      "announcement.rejected",
      "announcement.delivery",
      "escalation.notified",
      "escalation.replied",
      "fee_reminder.sent",
      "fee_reminder.skipped",
    ]) {
      expect(actions.has(action), `missing audit action ${action}`).toBe(true);
    }
  });
});
