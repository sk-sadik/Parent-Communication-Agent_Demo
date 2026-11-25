// Synthetic demo data only. No real students, parents or contact details.
// Idempotent: every row has a deterministic id and is upserted, so the seed can
// be re-run safely (for example after `npm run db:reset`).

import { pathToFileURL } from "node:url";
import { prisma } from "../src/db/prisma.js";

export const INSTITUTE_ID = "inst-demo-001";

// The demo dataset is anchored to a fixed date so data (and tests) are stable.
const DEMO_TODAY = "2026-11-25";

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function eachWeekday(startISO: string, endISO: string): string[] {
  const days: string[] = [];
  const end = day(endISO);
  for (const cursor = day(startISO); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      days.push(cursor.toISOString().slice(0, 10));
    }
  }
  return days;
}

const ATTENDANCE_DAYS = eachWeekday("2026-10-27", DEMO_TODAY);

interface TeacherSeed {
  id: string;
  name: string;
  assigned_class: string;
}

const TEACHERS: TeacherSeed[] = [
  { id: "tch-5a-001", name: "Lakshmi Rao", assigned_class: "5A" },
  { id: "tch-6a-001", name: "Venkatesh Gupta", assigned_class: "6A" },
];

interface StudentSeed {
  id: string;
  name: string;
  class: string;
  roll_number: string;
  base_score: number;
}

const STUDENTS: StudentSeed[] = [
  { id: "stu-5a-001", name: "Aarav Reddy", class: "5A", roll_number: "5A-01", base_score: 52 },
  { id: "stu-5a-002", name: "Sai Kumar", class: "5A", roll_number: "5A-02", base_score: 66 },
  { id: "stu-5a-003", name: "Bhavya Nandini", class: "5A", roll_number: "5A-03", base_score: 72 },
  { id: "stu-6a-001", name: "Rohan Das", class: "6A", roll_number: "6A-01", base_score: 58 },
  { id: "stu-6a-002", name: "Meera Iyer", class: "6A", roll_number: "6A-02", base_score: 80 },
  { id: "stu-6a-003", name: "Karthik Varma", class: "6A", roll_number: "6A-03", base_score: 64 },
];

interface GuardianSeed {
  id: string;
  name: string;
  language: "en" | "te";
}

// G1 and G2 each have one different child, so parent A can be refused access to
// parent B's child. G2 prefers Telugu. G3 and G4 each have two children.
const GUARDIANS: GuardianSeed[] = [
  { id: "gdn-001", name: "Ramesh Reddy", language: "en" },
  { id: "gdn-002", name: "Sunita Kumar", language: "te" },
  { id: "gdn-003", name: "Anil Das", language: "en" },
  { id: "gdn-004", name: "Padma Nandini", language: "en" },
];

interface LinkSeed {
  id: string;
  guardian_id: string;
  student_id: string;
  relationship: string;
  is_fee_contact: boolean;
}

// Exactly one fee-contact guardian per student.
const LINKS: LinkSeed[] = [
  { id: "lnk-001", guardian_id: "gdn-001", student_id: "stu-5a-001", relationship: "father", is_fee_contact: true },
  { id: "lnk-002", guardian_id: "gdn-002", student_id: "stu-5a-002", relationship: "mother", is_fee_contact: true },
  { id: "lnk-003", guardian_id: "gdn-003", student_id: "stu-6a-001", relationship: "father", is_fee_contact: true },
  { id: "lnk-004", guardian_id: "gdn-003", student_id: "stu-6a-002", relationship: "guardian", is_fee_contact: true },
  { id: "lnk-005", guardian_id: "gdn-004", student_id: "stu-5a-003", relationship: "mother", is_fee_contact: true },
  { id: "lnk-006", guardian_id: "gdn-004", student_id: "stu-6a-003", relationship: "aunt", is_fee_contact: true },
];

interface CodeSeed {
  id: string;
  code: string;
  role: "guardian" | "teacher";
  guardian_id?: string;
  teacher_id?: string;
}

// Readable demo codes. None used, all valid for 30 days from DEMO_TODAY.
const ACTIVATION_CODES: CodeSeed[] = [
  { id: "act-001", code: "PARENT-A1B2", role: "guardian", guardian_id: "gdn-001" },
  { id: "act-002", code: "PARENT-C3D4", role: "guardian", guardian_id: "gdn-002" },
  { id: "act-003", code: "PARENT-E5F6", role: "guardian", guardian_id: "gdn-003" },
  { id: "act-004", code: "PARENT-G7H8", role: "guardian", guardian_id: "gdn-004" },
  { id: "act-005", code: "TEACHER-J9K1", role: "teacher", teacher_id: "tch-5a-001" },
  { id: "act-006", code: "TEACHER-L3M4", role: "teacher", teacher_id: "tch-6a-001" },
];

const SUBJECTS = ["Mathematics", "English", "Science", "Telugu"];
const TESTS = [
  { name: "Unit Test 1", date: "2026-10-10" },
  { name: "Unit Test 2", date: "2026-10-31" },
  { name: "Unit Test 3", date: "2026-11-21" },
] as const;

// Aarav's maths scores improve visibly across the three tests.
const SCORE_OVERRIDES: Record<string, number[]> = {
  "stu-5a-001|Mathematics": [52, 67, 84],
};

interface FeeSeed {
  id: string;
  student_id: string;
  amount: string;
  due_date: string;
  paid: boolean;
}

const FEES: FeeSeed[] = STUDENTS.flatMap((student) => {
  const overdue = student.id === "stu-6a-003"; // one clearly overdue payment
  return [
    {
      id: `fee-${student.id}-term1`,
      student_id: student.id,
      amount: "4500.00",
      due_date: "2026-09-15",
      paid: !overdue,
    },
    {
      id: `fee-${student.id}-term2`,
      student_id: student.id,
      amount: "4500.00",
      due_date: "2026-12-15",
      paid: false,
    },
  ];
});

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function attendanceStatus(seedKey: string): "present" | "absent" | "late" {
  const bucket = stableHash(seedKey) % 100;
  if (bucket < 7) return "absent";
  if (bucket < 15) return "late";
  return "present";
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function clampScore(value: number): number {
  return Math.min(98, Math.max(35, value));
}

// Runs tasks with bounded concurrency: remote Postgres round-trips dominate the
// seed time, and the pg pool cannot handle unbounded parallelism.
async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<unknown>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) return;
      await task(item);
    }
  });
  await Promise.all(workers);
}

export const EXPECTED_COUNTS = {
  institute: 1,
  teacher: TEACHERS.length,
  student: STUDENTS.length,
  guardian: GUARDIANS.length,
  guardian_student_link: LINKS.length,
  activation_code: ACTIVATION_CODES.length,
  attendance: ATTENDANCE_DAYS.length * STUDENTS.length,
  marks: STUDENTS.length * SUBJECTS.length * TESTS.length,
  announcement: 3,
  fee: FEES.length,
  escalation: 2,
  audit_log: 2,
} as const;

export async function seed(): Promise<void> {
  await prisma.institute.upsert({
    where: { id: INSTITUTE_ID },
    update: { name: "Sunrise Public School (demo)" },
    create: { id: INSTITUTE_ID, name: "Sunrise Public School (demo)" },
  });

  await runWithConcurrency(TEACHERS, 4, (teacher) =>
    prisma.teacher.upsert({
      where: { id: teacher.id },
      update: { name: teacher.name, assigned_class: teacher.assigned_class },
      create: {
        id: teacher.id,
        institute_id: INSTITUTE_ID,
        name: teacher.name,
        assigned_class: teacher.assigned_class,
        telegram_chat_id: null,
      },
    }),
  );

  await runWithConcurrency(STUDENTS, 4, (student) =>
    prisma.student.upsert({
      where: { id: student.id },
      update: { name: student.name, class: student.class, roll_number: student.roll_number },
      create: {
        id: student.id,
        institute_id: INSTITUTE_ID,
        name: student.name,
        class: student.class,
        roll_number: student.roll_number,
      },
    }),
  );

  await runWithConcurrency(GUARDIANS, 4, (guardian) =>
    prisma.guardian.upsert({
      where: { id: guardian.id },
      update: { name: guardian.name, language: guardian.language },
      create: {
        id: guardian.id,
        institute_id: INSTITUTE_ID,
        name: guardian.name,
        language: guardian.language,
        telegram_chat_id: null,
      },
    }),
  );

  await runWithConcurrency(LINKS, 4, (link) =>
    prisma.guardianStudentLink.upsert({
      where: { id: link.id },
      update: {
        relationship: link.relationship,
        is_fee_contact: link.is_fee_contact,
        verified: true,
      },
      create: {
        id: link.id,
        institute_id: INSTITUTE_ID,
        guardian_id: link.guardian_id,
        student_id: link.student_id,
        relationship: link.relationship,
        is_fee_contact: link.is_fee_contact,
        verified: true,
      },
    }),
  );

  await runWithConcurrency(ACTIVATION_CODES, 4, (entry) => {
    const expires_at = new Date(Date.parse(`${DEMO_TODAY}T00:00:00.000Z`) + 30 * 24 * 60 * 60 * 1000);
    return prisma.activationCode.upsert({
      where: { id: entry.id },
      update: { expires_at, used_at: null },
      create: {
        id: entry.id,
        institute_id: INSTITUTE_ID,
        code: entry.code,
        role: entry.role,
        guardian_id: entry.guardian_id ?? null,
        teacher_id: entry.teacher_id ?? null,
        expires_at,
        used_at: null,
      },
    });
  });

  const attendanceRows = STUDENTS.flatMap((student) =>
    ATTENDANCE_DAYS.map((date) => {
      const id = `att-${student.id}-${date}`;
      return { id, student_id: student.id, date, status: attendanceStatus(id) };
    }),
  );

  await runWithConcurrency(attendanceRows, 8, (row) =>
    prisma.attendance.upsert({
      where: { id: row.id },
      update: { status: row.status },
      create: {
        id: row.id,
        institute_id: INSTITUTE_ID,
        student_id: row.student_id,
        date: day(row.date),
        status: row.status,
      },
    }),
  );

  const markRows = STUDENTS.flatMap((student) =>
    SUBJECTS.flatMap((subject) =>
      TESTS.map((test, testIndex) => {
        const override = SCORE_OVERRIDES[`${student.id}|${subject}`];
        const subjectOffset = (SUBJECTS.indexOf(subject) * 5 + STUDENTS.indexOf(student) * 3) % 9 - 4;
        const score = override
          ? override[testIndex]
          : clampScore(student.base_score + subjectOffset + testIndex * 2);

        return {
          id: `mark-${student.id}-${slug(subject)}-${slug(test.name)}`,
          student_id: student.id,
          subject,
          test_name: test.name,
          date: test.date,
          score,
        };
      }),
    ),
  );

  await runWithConcurrency(markRows, 8, async (row) => {
    if (row.score === undefined) return;
    await prisma.mark.upsert({
      where: { id: row.id },
      update: { score: row.score, max_score: 100, date: day(row.date) },
      create: {
        id: row.id,
        institute_id: INSTITUTE_ID,
        student_id: row.student_id,
        subject: row.subject,
        test_name: row.test_name,
        score: row.score,
        max_score: 100,
        date: day(row.date),
      },
    });
  });

  await runWithConcurrency(FEES, 4, (fee) =>
    prisma.fee.upsert({
      where: { id: fee.id },
      update: { amount: fee.amount, due_date: day(fee.due_date), paid: fee.paid },
      create: {
        id: fee.id,
        institute_id: INSTITUTE_ID,
        student_id: fee.student_id,
        amount: fee.amount,
        due_date: day(fee.due_date),
        paid: fee.paid,
      },
    }),
  );

  const announcements = [
    {
      id: "ann-5a-sports",
      class: "5A",
      text: "Annual sports day is on 12 December. Parents are welcome to attend.",
      status: "approved" as const,
      created_by_teacher_id: "tch-5a-001",
    },
    {
      id: "ann-5a-exam",
      class: "5A",
      text: "పరీక్ష ఫలితాలు డిసెంబర్ 1న పంపబడతాయి.",
      status: "approved" as const,
      created_by_teacher_id: "tch-5a-001",
    },
    {
      id: "ann-6a-draft",
      class: "6A",
      text: "Unit test 3 results will be shared next week.",
      status: "draft" as const,
      created_by_teacher_id: "tch-6a-001",
    },
  ];

  for (const announcement of announcements) {
    await prisma.announcement.upsert({
      where: { id: announcement.id },
      update: { text: announcement.text, status: announcement.status },
      create: {
        id: announcement.id,
        institute_id: INSTITUTE_ID,
        class: announcement.class,
        text: announcement.text,
        status: announcement.status,
        created_by_teacher_id: announcement.created_by_teacher_id,
      },
    });
  }

  const escalations = [
    {
      id: "esc-001",
      guardian_id: "gdn-002",
      student_id: "stu-5a-002",
      question: "Sai was absent on Monday. Could you share the class notes?",
      status: "open" as const,
      teacher_reply: null,
    },
    {
      id: "esc-002",
      guardian_id: "gdn-001",
      student_id: "stu-5a-001",
      question: "When is the Term 2 fee due?",
      status: "closed" as const,
      teacher_reply: "The Term 2 fee is due on 15 December 2026.",
    },
  ];

  for (const escalation of escalations) {
    await prisma.escalation.upsert({
      where: { id: escalation.id },
      update: { status: escalation.status, teacher_reply: escalation.teacher_reply },
      create: {
        id: escalation.id,
        institute_id: INSTITUTE_ID,
        guardian_id: escalation.guardian_id,
        student_id: escalation.student_id,
        question: escalation.question,
        status: escalation.status,
        teacher_reply: escalation.teacher_reply,
      },
    });
  }

  // Append-only: insert only, never update or delete.
  await prisma.auditLog.createMany({
    data: [
      {
        id: "audit-seed-001",
        institute_id: INSTITUTE_ID,
        actor_type: "system" as const,
        actor_id: null,
        action: "seed.synthetic_data_loaded",
        details: { source: "prisma/seed.ts", records: EXPECTED_COUNTS },
      },
      {
        id: "audit-seed-002",
        institute_id: INSTITUTE_ID,
        actor_type: "system" as const,
        actor_id: null,
        action: "activation_code.created",
        details: { count: ACTIVATION_CODES.length, role: "guardian+teacher" },
      },
    ],
    skipDuplicates: true,
  });
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    await seed();
    console.log("Seed complete.");
    console.log(
      `  institute 1, teachers ${EXPECTED_COUNTS.teacher}, students ${EXPECTED_COUNTS.student}, ` +
        `guardians ${EXPECTED_COUNTS.guardian}, attendance ${EXPECTED_COUNTS.attendance}, ` +
        `marks ${EXPECTED_COUNTS.marks}, fees ${EXPECTED_COUNTS.fee}, ` +
        `activation codes ${EXPECTED_COUNTS.activation_code}`,
    );
  } catch (error) {
    // Never print the error object wholesale: it can contain connection details.
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`Seed failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
