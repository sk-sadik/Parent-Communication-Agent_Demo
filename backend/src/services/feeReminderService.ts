// Teacher demo command: send one polite fee reminder per student with unpaid
// fees, to that student's fee-contact guardian only.
//
// Idempotency is enforced by the fee_reminder unique key
// (student_id, fee_id, due_date): the rows are claimed before sending, so a
// second run (or a double tap) sends nothing twice.

import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import type { NotificationChannel } from "../notifications/channel.js";
import { messages } from "../telegram/messages.js";
import { formatAmount, formatDate } from "./format.js";
import { recordAudit } from "./auditService.js";
import type { ResolvedTeacher } from "./authorizationService.js";

export type FeeSkipReason =
  | "no_dues"
  | "no_fee_contact"
  | "no_telegram"
  | "already_sent"
  | "delivery_failed";

export interface FeeReminderReport {
  /** Messages actually delivered. */
  sent: number;
  /** Fee rows covered by those messages. */
  sentFees: number;
  students: number;
  skipped: Record<FeeSkipReason, number>;
}

interface ClaimedFee {
  id: string;
  amount: number;
  due_date: Date;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

function emptySkipCounts(): Record<FeeSkipReason, number> {
  return {
    no_dues: 0,
    no_fee_contact: 0,
    no_telegram: 0,
    already_sent: 0,
    delivery_failed: 0,
  };
}

async function skip(
  instituteId: string,
  teacherId: string,
  studentId: string,
  reason: FeeSkipReason,
  report: FeeReminderReport,
): Promise<void> {
  report.skipped[reason] += 1;
  await recordAudit({
    instituteId,
    actorType: "teacher",
    actorId: teacherId,
    action: "fee_reminder.skipped",
    details: { student_id: studentId, reason },
  });
}

/**
 * Runs the demo fee reminder for every student in the teacher's own classes.
 * Amounts and due dates come straight from the fee records (Phase 3 data), and
 * the message is rendered in each guardian's saved language. No AI is used.
 */
export async function triggerFeeReminders(
  actor: ResolvedTeacher,
  channel: NotificationChannel,
): Promise<FeeReminderReport> {
  const report: FeeReminderReport = {
    sent: 0,
    sentFees: 0,
    students: 0,
    skipped: emptySkipCounts(),
  };

  if (actor.assignedClasses.length === 0) return report;

  const students = await prisma.student.findMany({
    where: {
      institute_id: actor.instituteId,
      class: { in: actor.assignedClasses },
    },
    orderBy: [{ class: "asc" }, { name: "asc" }],
    include: {
      fees: {
        where: { paid: false, institute_id: actor.instituteId },
        orderBy: { due_date: "asc" },
        select: { id: true, amount: true, due_date: true },
      },
      links: {
        where: { verified: true, is_fee_contact: true },
        include: {
          guardian: {
            select: {
              id: true,
              language: true,
              telegram_chat_id: true,
              institute_id: true,
            },
          },
        },
      },
    },
  });

  for (const student of students) {
    report.students += 1;

    if (student.fees.length === 0) {
      await skip(actor.instituteId, actor.teacherId, student.id, "no_dues", report);
      continue;
    }

    // A fee contact from another institute, or an unverified link, never counts.
    const feeContact = student.links.find(
      (link) =>
        link.institute_id === actor.instituteId &&
        link.guardian.institute_id === actor.instituteId,
    );
    const guardian = feeContact?.guardian;

    if (!feeContact || !guardian) {
      await skip(actor.instituteId, actor.teacherId, student.id, "no_fee_contact", report);
      continue;
    }

    if (!guardian.telegram_chat_id) {
      await skip(actor.instituteId, actor.teacherId, student.id, "no_telegram", report);
      continue;
    }

    const existing = await prisma.feeReminder.findMany({
      where: { student_id: student.id, guardian_id: guardian.id },
      select: { fee_id: true, due_date: true },
    });
    const reminded = new Set(
      existing.map((row) => `${row.fee_id}|${row.due_date.toISOString().slice(0, 10)}`),
    );

    const claimed: ClaimedFee[] = [];
    for (const fee of student.fees) {
      const key = `${fee.id}|${fee.due_date.toISOString().slice(0, 10)}`;
      if (reminded.has(key)) continue;

      try {
        await prisma.feeReminder.create({
          data: {
            id: randomUUID(),
            institute_id: actor.instituteId,
            student_id: student.id,
            fee_id: fee.id,
            guardian_id: guardian.id,
            due_date: fee.due_date,
          },
        });
        claimed.push({
          id: fee.id,
          amount: Number(fee.amount.toString()),
          due_date: fee.due_date,
        });
      } catch (error) {
        // Another run claimed this fee first: treat it as already sent.
        if (!isUniqueViolation(error)) throw error;
      }
    }

    if (claimed.length === 0) {
      await skip(actor.instituteId, actor.teacherId, student.id, "already_sent", report);
      continue;
    }

    const language = guardian.language;
    const lines = [
      messages.feeReminderHeader(student.name, student.class, language),
      "",
      ...claimed.map(
        (fee) =>
          `• ${formatAmount(fee.amount)} — ${
            language === "te" ? "గడువు" : "due"
          } ${formatDate(fee.due_date, language)}`,
      ),
      "",
      messages.feeReminderFooter(language),
    ];

    const result = await channel.send(guardian.id, lines.join("\n"));

    if (!result.ok) {
      // Release the claim so a later run can try again.
      await prisma.feeReminder.deleteMany({
        where: {
          student_id: student.id,
          guardian_id: guardian.id,
          fee_id: { in: claimed.map((fee) => fee.id) },
        },
      });
      await skip(actor.instituteId, actor.teacherId, student.id, "delivery_failed", report);
      continue;
    }

    report.sent += 1;
    report.sentFees += claimed.length;

    await recordAudit({
      instituteId: actor.instituteId,
      actorType: "teacher",
      actorId: actor.teacherId,
      action: "fee_reminder.sent",
      details: {
        student_id: student.id,
        guardian_id: guardian.id,
        fees: claimed.length,
      },
    });
  }

  return report;
}
