// Activation / linking logic. No Telegram imports: the bot is a thin wrapper so
// this can be tested without touching the network.

import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import type { ActivationRole, Language } from "../generated/prisma/enums.js";

export type RedeemFailureReason =
  | "invalid_code"
  | "expired_code"
  | "reused_code"
  | "wrong_role"
  | "already_linked"
  | "target_already_linked";

export interface RedeemedGuardian {
  ok: true;
  role: "guardian";
  guardianId: string;
  instituteId: string;
  name: string;
  language: Language;
}

export interface RedeemedTeacher {
  ok: true;
  role: "teacher";
  teacherId: string;
  instituteId: string;
  name: string;
  assignedClass: string;
}

export interface RedeemFailure {
  ok: false;
  reason: RedeemFailureReason;
}

export type RedeemResult = RedeemedGuardian | RedeemedTeacher | RedeemFailure;

export interface RedeemInput {
  code: string;
  chatId: string;
  // Optional guard for callers that know which role they expect. The bot itself
  // does not pass it, because the code decides the role.
  expectedRole?: ActivationRole;
}

function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Validates a one-time code and links it to a Telegram chat.
 * Atomic: the code is claimed with a conditional update so it can never be
 * redeemed twice, and the audit row is written in the same transaction.
 */
export async function redeemActivationCode(input: RedeemInput): Promise<RedeemResult> {
  const code = normaliseCode(input.code);
  const chatId = input.chatId.trim();

  if (!code || !chatId) {
    return { ok: false, reason: "invalid_code" };
  }

  return prisma.$transaction(
    async (tx) => {
      const [linkedGuardian, linkedTeacher] = await Promise.all([
        tx.guardian.findUnique({ where: { telegram_chat_id: chatId }, select: { id: true } }),
        tx.teacher.findUnique({ where: { telegram_chat_id: chatId }, select: { id: true } }),
      ]);

      // A chat can belong to exactly one person. Never relink silently.
      if (linkedGuardian || linkedTeacher) {
        return { ok: false, reason: "already_linked" } as const;
      }

      const record = await tx.activationCode.findUnique({
        where: { code },
        include: { guardian: true, teacher: true },
      });

      if (!record) {
        return { ok: false, reason: "invalid_code" } as const;
      }

      if (record.used_at) {
        return { ok: false, reason: "reused_code" } as const;
      }

      if (record.expires_at.getTime() <= Date.now()) {
        return { ok: false, reason: "expired_code" } as const;
      }

      if (input.expectedRole && record.role !== input.expectedRole) {
        return { ok: false, reason: "wrong_role" } as const;
      }

      // The code's role must match the target it points at.
      if (record.role === "guardian" && !record.guardian) {
        return { ok: false, reason: "wrong_role" } as const;
      }
      if (record.role === "teacher" && !record.teacher) {
        return { ok: false, reason: "wrong_role" } as const;
      }

      const target =
        record.role === "guardian" ? record.guardian : record.teacher;

      if (target?.telegram_chat_id && target.telegram_chat_id !== chatId) {
        // The person already linked a different Telegram account; do not steal it.
        return { ok: false, reason: "target_already_linked" } as const;
      }

      const claimed = await tx.activationCode.updateMany({
        where: { id: record.id, used_at: null },
        data: { used_at: new Date() },
      });

      if (claimed.count !== 1) {
        return { ok: false, reason: "reused_code" } as const;
      }

      if (record.role === "guardian" && record.guardian) {
        const guardian = await tx.guardian.update({
          where: { id: record.guardian.id },
          data: { telegram_chat_id: chatId },
        });

        await tx.auditLog.create({
          data: {
            id: randomUUID(),
            institute_id: guardian.institute_id,
            actor_type: "guardian",
            actor_id: guardian.id,
            action: "activation_code.redeemed",
            details: {
              activation_code_id: record.id,
              role: record.role,
              chat_id: chatId,
            },
          },
        });

        return {
          ok: true,
          role: "guardian",
          guardianId: guardian.id,
          instituteId: guardian.institute_id,
          name: guardian.name,
          language: guardian.language,
        } as const;
      }

      if (record.role === "teacher" && record.teacher) {
        const teacher = await tx.teacher.update({
          where: { id: record.teacher.id },
          data: { telegram_chat_id: chatId },
        });

        await tx.auditLog.create({
          data: {
            id: randomUUID(),
            institute_id: teacher.institute_id,
            actor_type: "teacher",
            actor_id: teacher.id,
            action: "activation_code.redeemed",
            details: {
              activation_code_id: record.id,
              role: record.role,
              chat_id: chatId,
            },
          },
        });

        return {
          ok: true,
          role: "teacher",
          teacherId: teacher.id,
          instituteId: teacher.institute_id,
          name: teacher.name,
          assignedClass: teacher.assigned_class,
        } as const;
      }

      return { ok: false, reason: "wrong_role" } as const;
    },
    { timeout: 15_000, maxWait: 10_000 },
  );
}

export interface SetLanguageSuccess {
  ok: true;
  name: string;
  language: Language;
}

export interface SetLanguageFailure {
  ok: false;
  reason: "not_linked";
}

export async function setGuardianLanguage(
  chatId: string,
  language: Language,
): Promise<SetLanguageSuccess | SetLanguageFailure> {
  const guardian = await prisma.guardian.findUnique({ where: { telegram_chat_id: chatId } });
  if (!guardian) {
    return { ok: false, reason: "not_linked" };
  }

  if (guardian.language !== language) {
    await prisma.$transaction([
      prisma.guardian.update({ where: { id: guardian.id }, data: { language } }),
      prisma.auditLog.create({
        data: {
          id: randomUUID(),
          institute_id: guardian.institute_id,
          actor_type: "guardian",
          actor_id: guardian.id,
          action: "guardian.language_set",
          details: { from: guardian.language, to: language },
        },
      }),
    ]);
  }

  return { ok: true, name: guardian.name, language };
}
