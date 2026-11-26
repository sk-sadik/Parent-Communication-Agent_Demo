import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redeemActivationCode, setGuardianLanguage } from "../src/services/activationService.js";
import {
  AuthorizationError,
  getAuthorizedClasses,
  getAuthorizedStudentIds,
  getAuthorizedStudents,
  isClassAuthorized,
  isStudentAuthorized,
  requireClassAccess,
  requireStudentAccess,
  resolveActorByChatId,
} from "../src/services/authorizationService.js";
import { messages } from "../src/telegram/messages.js";
import { prisma } from "../src/db/prisma.js";

const INST_B = "inst-test-b";
const INST_C = "inst-test-c";

const CHAT_G1 = "test-chat-g1"; // Parent One: two children in institute B
const CHAT_G2 = "test-chat-g2"; // Parent Two: one different child in institute B
const CHAT_GC = "test-chat-gc"; // Parent C: institute C
const CHAT_T = "test-chat-t"; // Teacher in institute B, class 7B

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const PAST = new Date("2026-01-01T00:00:00.000Z");

async function resetFixtures(): Promise<void> {
  // Cascade delete keeps repeated runs deterministic.
  await prisma.institute.deleteMany({ where: { id: { in: [INST_B, INST_C] } } });

  await prisma.institute.createMany({
    data: [
      { id: INST_B, name: "Test Institute B (synthetic)" },
      { id: INST_C, name: "Test Institute C (synthetic)" },
    ],
  });

  await prisma.guardian.createMany({
    data: [
      { id: "gdn-tb1", institute_id: INST_B, name: "Test Parent One", language: "en", telegram_chat_id: CHAT_G1 },
      { id: "gdn-tb2", institute_id: INST_B, name: "Test Parent Two", language: "en", telegram_chat_id: CHAT_G2 },
      { id: "gdn-tb3", institute_id: INST_B, name: "Test Parent Three", language: "en", telegram_chat_id: null },
      { id: "gdn-tc1", institute_id: INST_C, name: "Test Parent C", language: "en", telegram_chat_id: CHAT_GC },
    ],
  });

  await prisma.teacher.createMany({
    data: [
      { id: "tch-tb1", institute_id: INST_B, name: "Test Teacher B", assigned_class: "7B", telegram_chat_id: CHAT_T },
      { id: "tch-tb2", institute_id: INST_B, name: "Test Teacher B2", assigned_class: "7B", telegram_chat_id: null },
    ],
  });

  await prisma.student.createMany({
    data: [
      { id: "stu-tb1", institute_id: INST_B, name: "Test Child One", class: "7B", roll_number: "7B-01" },
      { id: "stu-tb2", institute_id: INST_B, name: "Test Child Two", class: "7B", roll_number: "7B-02" },
      { id: "stu-tb3", institute_id: INST_B, name: "Test Child Three", class: "7B", roll_number: "7B-03" },
      { id: "stu-tc1", institute_id: INST_C, name: "Test Child C", class: "8C", roll_number: "8C-01" },
    ],
  });

  await prisma.guardianStudentLink.createMany({
    data: [
      { id: "lnk-tb1", institute_id: INST_B, guardian_id: "gdn-tb1", student_id: "stu-tb1", relationship: "mother", is_fee_contact: true, verified: true },
      { id: "lnk-tb2", institute_id: INST_B, guardian_id: "gdn-tb1", student_id: "stu-tb3", relationship: "mother", is_fee_contact: true, verified: true },
      { id: "lnk-tb3", institute_id: INST_B, guardian_id: "gdn-tb2", student_id: "stu-tb2", relationship: "father", is_fee_contact: true, verified: true },
      { id: "lnk-tc1", institute_id: INST_C, guardian_id: "gdn-tc1", student_id: "stu-tc1", relationship: "mother", is_fee_contact: true, verified: true },
      // Deliberately malformed: institute B link pointing at an institute C child.
      { id: "lnk-bad", institute_id: INST_B, guardian_id: "gdn-tb1", student_id: "stu-tc1", relationship: "guardian", is_fee_contact: false, verified: true },
    ],
  });

  await prisma.activationCode.createMany({
    data: [
      { id: "code-valid", institute_id: INST_B, code: "TEST-VALID-G3", role: "guardian", guardian_id: "gdn-tb3", expires_at: FUTURE },
      { id: "code-expired", institute_id: INST_B, code: "TEST-EXPIRED", role: "guardian", guardian_id: "gdn-tb3", expires_at: PAST },
      { id: "code-reused", institute_id: INST_B, code: "TEST-REUSED", role: "guardian", guardian_id: "gdn-tb3", expires_at: FUTURE, used_at: new Date() },
      { id: "code-wrong-role", institute_id: INST_B, code: "TEST-WRONGROLE", role: "teacher", teacher_id: "tch-tb1", expires_at: FUTURE },
      { id: "code-teacher-ok", institute_id: INST_B, code: "TEST-TEACHER-OK", role: "teacher", teacher_id: "tch-tb2", expires_at: FUTURE },
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

describe("authorization service", () => {
  it("returns nothing for an unknown chat id", async () => {
    await expect(resolveActorByChatId("test-chat-does-not-exist")).resolves.toBeNull();
    await expect(getAuthorizedStudents("test-chat-does-not-exist")).resolves.toEqual([]);
    await expect(isStudentAuthorized("test-chat-does-not-exist", "stu-tb1")).resolves.toBe(false);
  });

  it("does not let Parent One access Parent Two's child", async () => {
    await expect(isStudentAuthorized(CHAT_G1, "stu-tb2")).resolves.toBe(false);
    await expect(requireStudentAccess(CHAT_G1, "stu-tb2")).rejects.toBeInstanceOf(
      AuthorizationError,
    );

    const actor = await resolveActorByChatId(CHAT_G1);
    expect(actor?.kind).toBe("guardian");
    if (actor?.kind !== "guardian") throw new Error("expected a guardian actor");
    expect(actor.studentIds).not.toContain("stu-tb2");
  });

  it("shows a guardian with two children exactly those two", async () => {
    await expect(getAuthorizedStudentIds(CHAT_G1)).resolves.toEqual(["stu-tb1", "stu-tb3"]);

    const students = await getAuthorizedStudents(CHAT_G1);
    expect(students.map((student) => student.id).sort()).toEqual(["stu-tb1", "stu-tb3"]);
  });

  it("keeps institutes isolated, even with a malformed cross-institute link", async () => {
    const actor = await resolveActorByChatId(CHAT_G1);
    expect(actor?.kind).toBe("guardian");
    expect(actor?.instituteId).toBe(INST_B);

    const students = await getAuthorizedStudents(CHAT_G1);
    expect(students.every((student) => student.institute_id === INST_B)).toBe(true);

    // lnk-bad points at an institute C child and must be ignored.
    await expect(isStudentAuthorized(CHAT_G1, "stu-tc1")).resolves.toBe(false);

    // Parent C sees only their own institute's child.
    await expect(getAuthorizedStudentIds(CHAT_GC)).resolves.toEqual(["stu-tc1"]);
  });

  it("limits a teacher to the assigned class", async () => {
    await expect(getAuthorizedClasses(CHAT_T)).resolves.toEqual(["7B"]);
    await expect(isClassAuthorized(CHAT_T, "7B")).resolves.toBe(true);
    await expect(isClassAuthorized(CHAT_T, "8C")).resolves.toBe(false);
    await expect(requireClassAccess(CHAT_T, "8C")).rejects.toBeInstanceOf(AuthorizationError);

    // Teachers have no student-level access.
    await expect(isStudentAuthorized(CHAT_T, "stu-tb1")).resolves.toBe(false);
  });
});

describe("activation code redemption", () => {
  it("rejects an invalid code", async () => {
    await expect(redeemActivationCode({ code: "NO-SUCH-CODE", chatId: "test-chat-x1" })).resolves.toEqual({
      ok: false,
      reason: "invalid_code",
    });
  });

  it("rejects an expired code", async () => {
    await expect(redeemActivationCode({ code: "TEST-EXPIRED", chatId: "test-chat-x2" })).resolves.toEqual({
      ok: false,
      reason: "expired_code",
    });
  });

  it("rejects a reused code", async () => {
    await expect(redeemActivationCode({ code: "TEST-REUSED", chatId: "test-chat-x3" })).resolves.toEqual({
      ok: false,
      reason: "reused_code",
    });
  });

  it("rejects a code used for the wrong role", async () => {
    await expect(
      redeemActivationCode({
        code: "TEST-WRONGROLE",
        chatId: "test-chat-x4",
        expectedRole: "guardian",
      }),
    ).resolves.toEqual({ ok: false, reason: "wrong_role" });
  });

  it("links a guardian once, marks the code used and writes audit rows", async () => {
    const result = await redeemActivationCode({ code: "test-valid-g3", chatId: "test-chat-g3" });

    expect(result.ok).toBe(true);
    if (!result.ok || result.role !== "guardian") return;
    expect(result.language).toBe("en");

    const guardian = await prisma.guardian.findUnique({ where: { id: "gdn-tb3" } });
    expect(guardian?.telegram_chat_id).toBe("test-chat-g3");

    const code = await prisma.activationCode.findUnique({ where: { id: "code-valid" } });
    expect(code?.used_at).not.toBeNull();

    const audits = await prisma.auditLog.count({
      where: { institute_id: INST_B, action: "activation_code.redeemed", actor_id: "gdn-tb3" },
    });
    expect(audits).toBe(1);

    // Same chat again: already linked, never relinked.
    await expect(
      redeemActivationCode({ code: "TEST-VALID-G3", chatId: "test-chat-g3" }),
    ).resolves.toEqual({ ok: false, reason: "already_linked" });

    // Different chat with the now-used code: reused.
    await expect(
      redeemActivationCode({ code: "TEST-VALID-G3", chatId: "test-chat-other" }),
    ).resolves.toEqual({ ok: false, reason: "reused_code" });
  });

  it("links a teacher and reports the assigned class", async () => {
    const result = await redeemActivationCode({ code: "TEST-TEACHER-OK", chatId: "test-chat-t2" });

    expect(result.ok).toBe(true);
    if (!result.ok || result.role !== "teacher") return;
    expect(result.assignedClass).toBe("7B");

    const teacher = await prisma.teacher.findUnique({ where: { id: "tch-tb2" } });
    expect(teacher?.telegram_chat_id).toBe("test-chat-t2");
  });

  it("saves the guardian language and audits the change", async () => {
    const result = await setGuardianLanguage("test-chat-g3", "te");
    expect(result).toEqual({ ok: true, name: "Test Parent Three", language: "te" });

    const guardian = await prisma.guardian.findUnique({ where: { id: "gdn-tb3" } });
    expect(guardian?.language).toBe("te");

    const audits = await prisma.auditLog.count({
      where: { institute_id: INST_B, action: "guardian.language_set", actor_id: "gdn-tb3" },
    });
    expect(audits).toBe(1);
  });

  it("switches an already linked guardian from Telugu back to English", async () => {
    await setGuardianLanguage("test-chat-g3", "te");

    const result = await setGuardianLanguage("test-chat-g3", "en");
    expect(result).toEqual({ ok: true, name: "Test Parent Three", language: "en" });

    const guardian = await prisma.guardian.findUnique({ where: { id: "gdn-tb3" } });
    expect(guardian?.language).toBe("en");

    const audits = await prisma.auditLog.findMany({
      where: { institute_id: INST_B, action: "guardian.language_set", actor_id: "gdn-tb3" },
      select: { details: true },
    });
    expect(
      audits.some((audit) => (audit.details as { to?: string }).to === "en"),
    ).toBe(true);
  });

  it("refuses language selection for an unlinked chat", async () => {
    await expect(setGuardianLanguage("test-chat-nobody", "en")).resolves.toEqual({
      ok: false,
      reason: "not_linked",
    });
  });
});

describe("welcome messages", () => {
  it("tell parents they are talking to an AI assistant, in both languages", () => {
    expect(messages.welcome("Demo Parent", "en")).toContain("AI assistant");
    expect(messages.welcome("Demo Parent", "te")).toContain("AI సహాయకుడి");
  });
});
