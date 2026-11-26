// Teacher side of an escalation:
//   * notify the class teacher when the escalation is created,
//   * list open escalations for the teacher's own class,
//   * relay the teacher's reply to the parent and close the escalation.
//
// Attaching the child / class is always re-checked here: the escalation record
// and the teacher's assignment must agree.

import { prisma } from "../db/prisma.js";
import type { NotificationChannel } from "../notifications/channel.js";
import { messages } from "../telegram/messages.js";
import type { Language } from "../generated/prisma/enums.js";
import {
  getTeacherForClass,
  type ResolvedTeacher,
} from "./authorizationService.js";
import { recordAudit } from "./auditService.js";

const MAX_REPLY = 1000;

export type NotifyFailureReason =
  | "not_found"
  | "no_student"
  | "no_teacher"
  | "teacher_unlinked"
  | "send_failed";

export interface NotifyResult {
  notified: boolean;
  teacherId?: string;
  reason?: NotifyFailureReason;
}

/** Sends the question to the teacher of the student's class. Never throws. */
export async function notifyEscalationTeacher(
  escalationId: string,
  channel: NotificationChannel,
): Promise<NotifyResult> {
  const escalation = await prisma.escalation.findUnique({
    where: { id: escalationId },
    include: { student: true },
  });

  if (!escalation) return { notified: false, reason: "not_found" };

  // Escalations with no identified child cannot be routed to a class teacher
  // without guessing, so they stay visible only through the record.
  if (!escalation.student) {
    await auditNotify(escalation.institute_id, escalationId, false, "no_student");
    return { notified: false, reason: "no_student" };
  }

  const teacher = await getTeacherForClass(escalation.institute_id, escalation.student.class);
  if (!teacher) {
    await auditNotify(escalation.institute_id, escalationId, false, "no_teacher");
    return { notified: false, reason: "no_teacher" };
  }

  if (!teacher.telegramChatId) {
    await auditNotify(escalation.institute_id, escalationId, false, "teacher_unlinked", teacher.id);
    return { notified: false, teacherId: teacher.id, reason: "teacher_unlinked" };
  }

  const result = await channel.sendToTeacher(
    teacher.id,
    messages.escalationForTeacher(escalation.student.name, escalation.question),
    {
      inlineKeyboard: [
        [{ text: "Reply to parent", callback_data: `esc:reply:${escalation.id}` }],
      ],
    },
  );

  await auditNotify(
    escalation.institute_id,
    escalationId,
    result.ok,
    result.ok ? undefined : `send_${result.reason ?? "error"}`,
    teacher.id,
  );

  return result.ok
    ? { notified: true, teacherId: teacher.id }
    : { notified: false, teacherId: teacher.id, reason: "send_failed" };
}

async function auditNotify(
  instituteId: string,
  escalationId: string,
  delivered: boolean,
  reason?: string,
  teacherId?: string,
): Promise<void> {
  await recordAudit({
    instituteId,
    actorType: "system",
    actorId: null,
    action: "escalation.notified",
    details: {
      escalation_id: escalationId,
      delivered,
      ...(teacherId ? { teacher_id: teacherId } : {}),
      ...(reason ? { reason } : {}),
    },
  });
}

export interface OpenEscalation {
  id: string;
  studentName: string;
  studentClass: string;
  question: string;
  createdAt: Date;
}

/** Only escalations for students in the teacher's own classes. */
export async function listOpenEscalations(
  actor: ResolvedTeacher,
): Promise<OpenEscalation[]> {
  if (actor.assignedClasses.length === 0) return [];

  const students = await prisma.student.findMany({
    where: {
      institute_id: actor.instituteId,
      class: { in: actor.assignedClasses },
    },
    select: { id: true },
  });
  if (students.length === 0) return [];

  const rows = await prisma.escalation.findMany({
    where: {
      institute_id: actor.instituteId,
      status: "open",
      student_id: { in: students.map((student) => student.id) },
    },
    include: { student: true },
    orderBy: { created_at: "asc" },
  });

  return rows
    .filter((row): row is typeof row & { student: NonNullable<typeof row.student> } =>
      Boolean(row.student),
    )
    .map((row) => ({
      id: row.id,
      studentName: row.student.name,
      studentClass: row.student.class,
      question: row.question,
      createdAt: row.created_at,
    }));
}

export type ReplyFailureReason =
  | "empty"
  | "not_found"
  | "wrong_class"
  | "closed"
  | "delivery_failed";

/** A single open escalation, only when it belongs to the teacher's class. */
export async function getOpenEscalationForTeacher(
  actor: ResolvedTeacher,
  escalationId: string,
): Promise<OpenEscalation | null> {
  const row = await prisma.escalation.findFirst({
    where: { id: escalationId, institute_id: actor.instituteId, status: "open" },
    include: { student: true },
  });

  if (!row?.student) return null;
  if (!actor.assignedClasses.includes(row.student.class)) return null;

  return {
    id: row.id,
    studentName: row.student.name,
    studentClass: row.student.class,
    question: row.question,
    createdAt: row.created_at,
  };
}

export type ReplyResult =
  | { ok: true }
  | { ok: false; reason: ReplyFailureReason };

/**
 * Claims the escalation (open -> closed) before sending, so two replies cannot
 * both reach the parent. Only the guardian who raised it is messaged.
 */
export async function replyToEscalation(
  actor: ResolvedTeacher,
  escalationId: string,
  input: string,
  channel: NotificationChannel,
): Promise<ReplyResult> {
  const text = input.trim().slice(0, MAX_REPLY);
  if (!text) return { ok: false, reason: "empty" };

  const escalation = await prisma.escalation.findUnique({
    where: { id: escalationId },
    include: { student: true, guardian: { select: { id: true, language: true } } },
  });

  if (!escalation || escalation.institute_id !== actor.instituteId) {
    return { ok: false, reason: "not_found" };
  }
  if (!escalation.student || !actor.assignedClasses.includes(escalation.student.class)) {
    return { ok: false, reason: "wrong_class" };
  }
  if (escalation.status !== "open") return { ok: false, reason: "closed" };

  const claimed = await prisma.escalation.updateMany({
    where: { id: escalationId, institute_id: actor.instituteId, status: "open" },
    data: { status: "closed", teacher_reply: text },
  });
  if (claimed.count !== 1) return { ok: false, reason: "closed" };

  const language = escalation.guardian.language as Language;
  const delivered = await channel.send(
    escalation.guardian_id,
    messages.teacherReply(actor.name, text, language),
  );

  await recordAudit({
    instituteId: actor.instituteId,
    actorType: "teacher",
    actorId: actor.teacherId,
    action: "escalation.replied",
    details: {
      escalation_id: escalationId,
      student_id: escalation.student.id,
      delivered: delivered.ok,
      ...(delivered.ok ? {} : { reason: delivered.reason ?? "error" }),
    },
  });

  if (!delivered.ok) return { ok: false, reason: "delivery_failed" };
  return { ok: true };
}
