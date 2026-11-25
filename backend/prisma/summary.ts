// Prints a human-readable summary of the seeded demo database.
// Never prints connection strings, hosts, users or passwords.

import { prisma } from "../src/db/prisma.js";

const TABLES = [
  "institute",
  "teacher",
  "student",
  "guardian",
  "guardian_student_link",
  "activation_code",
  "attendance",
  "marks",
  "announcement",
  "fee",
  "escalation",
  "audit_log",
] as const;

async function countAll(): Promise<Record<string, number>> {
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

function formatDate(value: Date | null): string {
  if (!value) return "not used";
  return value.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const counts = await countAll();

  console.log("\nParent Communication Agent - demo database summary\n");

  console.log("Rows per table:");
  for (const table of TABLES) {
    console.log(`  ${table.padEnd(22)} ${counts[table] ?? 0}`);
  }

  const guardians = await prisma.guardian.findMany({
    orderBy: { name: "asc" },
    include: {
      links: {
        include: { student: true },
        orderBy: { student: { name: "asc" } },
      },
    },
  });

  console.log(`\nGuardians (${guardians.length}):`);
  for (const guardian of guardians) {
    const telegram = guardian.telegram_chat_id ? "telegram linked" : "telegram not linked";
    console.log(`  ${guardian.name} [${guardian.language}] - ${telegram}`);
    for (const link of guardian.links) {
      const feeContact = link.is_fee_contact ? ", fee contact" : "";
      console.log(
        `    - ${link.student.name} (${link.student.class}, roll ${link.student.roll_number})` +
          ` - ${link.relationship}${feeContact}${link.verified ? "" : ", unverified"}`,
      );
    }
  }

  const codes = await prisma.activationCode.findMany({
    orderBy: { code: "asc" },
    include: { guardian: true, teacher: true },
  });

  console.log(`\nActivation codes (${codes.length}):`);
  for (const code of codes) {
    const target = code.guardian?.name ?? code.teacher?.name ?? "(no target)";
    console.log(
      `  ${code.code.padEnd(14)} ${code.role.padEnd(8)} -> ${target}` +
        ` | expires ${formatDate(code.expires_at)} | ${code.used_at ? "USED" : "unused"}`,
    );
  }

  console.log("");
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`Summary failed: ${message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
