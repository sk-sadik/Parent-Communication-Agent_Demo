// Escalation records for questions the AI must not answer: discipline, health,
// bullying, disputes, and anything outside the available school records.

import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import type { ResolvedGuardian } from "./authorizationService.js";
import { recordAudit } from "./auditService.js";

const MAX_QUESTION = 500;

export interface CreateEscalationInput {
  actor: ResolvedGuardian;
  /** Only set when the child is known and already authorized for this guardian. */
  studentId: string | null;
  question: string;
  reason?: string;
}

export interface CreatedEscalation {
  id: string;
  studentId: string | null;
}

export async function createEscalation(
  input: CreateEscalationInput,
): Promise<CreatedEscalation> {
  const { actor } = input;

  // Never attach a child id the guardian is not verified for.
  const studentId =
    input.studentId && actor.studentIds.includes(input.studentId) ? input.studentId : null;
  const question = input.question.trim().slice(0, MAX_QUESTION);
  const id = randomUUID();

  await prisma.escalation.create({
    data: {
      id,
      institute_id: actor.instituteId,
      guardian_id: actor.guardianId,
      student_id: studentId,
      question,
      status: "open",
    },
  });

  await recordAudit({
    instituteId: actor.instituteId,
    actorType: "guardian",
    actorId: actor.guardianId,
    action: "escalation.created",
    details: {
      channel: "telegram",
      escalation_id: id,
      question,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(studentId ? { student_id: studentId } : {}),
    },
  });

  return { id, studentId };
}
