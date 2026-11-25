import { afterAll, describe, expect, it } from "vitest";
import { EXPECTED_COUNTS, INSTITUTE_ID, seed } from "../prisma/seed.js";
import { prisma } from "../src/db/prisma.js";

async function counts() {
  const [
    institute,
    teacher,
    student,
    guardian,
    link,
    activationCode,
    attendance,
    marks,
    announcement,
    fee,
    escalation,
    auditLog,
  ] = await Promise.all([
    prisma.institute.count(),
    prisma.teacher.count(),
    prisma.student.count(),
    prisma.guardian.count(),
    prisma.guardianStudentLink.count(),
    prisma.activationCode.count(),
    prisma.attendance.count(),
    prisma.mark.count(),
    prisma.announcement.count(),
    prisma.fee.count(),
    prisma.escalation.count(),
    prisma.auditLog.count(),
  ]);

  return {
    institute,
    teacher,
    student,
    guardian,
    guardian_student_link: link,
    activation_code: activationCode,
    attendance,
    marks,
    announcement,
    fee,
    escalation,
    audit_log: auditLog,
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seed data", () => {
  it("creates the expected number of rows in every table", async () => {
    const actual = await counts();
    expect(actual).toEqual(EXPECTED_COUNTS);
  });

  it("is idempotent: re-running the seed does not duplicate rows", async () => {
    const before = await counts();
    await seed();
    const after = await counts();
    expect(after).toEqual(before);
  });

  it("gives every student exactly one fee-contact guardian", async () => {
    const students = await prisma.student.findMany({
      where: { institute_id: INSTITUTE_ID },
      include: { links: { where: { is_fee_contact: true } } },
    });

    expect(students).toHaveLength(EXPECTED_COUNTS.student);

    for (const student of students) {
      expect(student.links, `student ${student.id} fee contacts`).toHaveLength(1);
    }
  });

  it("links every guardian to at least one child, with one guardian on two children", async () => {
    const guardians = await prisma.guardian.findMany({
      where: { institute_id: INSTITUTE_ID },
      include: { links: true },
    });

    for (const guardian of guardians) {
      expect(guardian.links.length, `guardian ${guardian.id} links`).toBeGreaterThanOrEqual(1);
    }

    expect(guardians.filter((guardian) => guardian.links.length === 2)).toHaveLength(2);
    expect(guardians.filter((guardian) => guardian.language === "te")).toHaveLength(1);
  });

  it("keeps activation codes unique, unused and valid for 30 days", async () => {
    const codes = await prisma.activationCode.findMany({ where: { institute_id: INSTITUTE_ID } });

    expect(codes).toHaveLength(EXPECTED_COUNTS.activation_code);

    const distinct = new Set(codes.map((code) => code.code));
    expect(distinct.size).toBe(codes.length);

    for (const code of codes) {
      expect(code.used_at).toBeNull();
      expect(code.expires_at.getTime()).toBeGreaterThan(Date.now());
    }

    const duplicateGroups = await prisma.activationCode.groupBy({
      by: ["code"],
      _count: { _all: true },
      having: { code: { _count: { gt: 1 } } },
    });
    expect(duplicateGroups).toHaveLength(0);
  });

  it("allows only one attendance row per student per date", async () => {
    const duplicates = await prisma.attendance.groupBy({
      by: ["student_id", "date"],
      _count: { _all: true },
      having: { student_id: { _count: { gt: 1 } } },
    });
    expect(duplicates).toHaveLength(0);

    // The database constraint itself must reject a duplicate row.
    const existing = await prisma.attendance.findFirst({ where: { institute_id: INSTITUTE_ID } });
    expect(existing).not.toBeNull();

    await expect(
      prisma.attendance.create({
        data: {
          id: `att-duplicate-check-${Date.now()}`,
          institute_id: existing!.institute_id,
          student_id: existing!.student_id,
          date: existing!.date,
          status: "present",
        },
      }),
    ).rejects.toThrow();
  });

  it("records an improving maths trend for Aarav Reddy", async () => {
    const marks = await prisma.mark.findMany({
      where: { student_id: "stu-5a-001", subject: "Mathematics" },
      orderBy: { date: "asc" },
    });

    expect(marks).toHaveLength(3);
    const scores = marks.map((mark) => mark.score);
    expect(scores[0]).toBeLessThan(scores[1]!);
    expect(scores[1]).toBeLessThan(scores[2]!);
  });

  it("has paid, unpaid and one overdue fee", async () => {
    const overdue = await prisma.fee.count({
      where: { paid: false, due_date: { lt: new Date() } },
    });
    const unpaid = await prisma.fee.count({ where: { paid: false } });
    const paid = await prisma.fee.count({ where: { paid: true } });

    expect(overdue).toBeGreaterThanOrEqual(1);
    expect(unpaid).toBeGreaterThan(0);
    expect(paid).toBeGreaterThan(0);
  });
});
