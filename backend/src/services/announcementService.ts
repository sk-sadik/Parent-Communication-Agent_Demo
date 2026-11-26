// Teacher announcement workflow: draft -> (edit / reject) -> approve -> deliver.
//
// Only approved announcements are delivered, and only to linked guardians of
// the teacher's own class. Delivery is claimed with a conditional update, so a
// second Approve press can never send twice.

import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { improveAnnouncementText } from "../ai/announcementService.js";
import type { NotificationChannel } from "../notifications/channel.js";
import { assertClassAccess, type ResolvedTeacher } from "./authorizationService.js";
import { recordAudit } from "./auditService.js";

export const MAX_ANNOUNCEMENT_LENGTH = 1200;

export type AnnouncementFailureReason =
  | "empty"
  | "no_class"
  | "not_found"
  | "not_draft"
  | "rejected"
  | "wrong_class";

export interface AnnouncementDraft {
  id: string;
  class: string;
  text: string;
  usedAi: boolean;
}

export type DraftResult =
  | { ok: true; draft: AnnouncementDraft }
  | { ok: false; reason: AnnouncementFailureReason };

export interface DeliveryReport {
  ok: true;
  alreadyDelivered: boolean;
  sent: number;
  skippedUnlinked: number;
  failed: number;
}

export type ApproveResult = DeliveryReport | { ok: false; reason: AnnouncementFailureReason };

function primaryClass(actor: ResolvedTeacher): string | null {
  return actor.assignedClasses[0] ?? null;
}

function cleanText(text: string): string {
  return text.trim().slice(0, MAX_ANNOUNCEMENT_LENGTH);
}

async function improvedText(text: string): Promise<{ text: string; usedAi: boolean }> {
  const improved = await improveAnnouncementText(text);
  // The AI service already falls back to the original on any problem.
  return { text: improved.text.trim() || text, usedAi: improved.usedAi };
}

/** Creates a draft from the teacher's own class. There is no class parameter,
 * so a teacher cannot target another class. */
export async function createAnnouncementDraft(
  actor: ResolvedTeacher,
  input: string,
): Promise<DraftResult> {
  const className = primaryClass(actor);
  if (!className) return { ok: false, reason: "no_class" };
  assertClassAccess(actor, className);

  const original = cleanText(input);
  if (!original) return { ok: false, reason: "empty" };

  const improved = await improvedText(original);

  const id = randomUUID();
  await prisma.announcement.create({
    data: {
      id,
      institute_id: actor.instituteId,
      class: className,
      text: improved.text,
      status: "draft",
      created_by_teacher_id: actor.teacherId,
    },
  });

  await recordAudit({
    instituteId: actor.instituteId,
    actorType: "teacher",
    actorId: actor.teacherId,
    action: "announcement.draft",
    details: {
      announcement_id: id,
      class: className,
      ai_used: improved.usedAi,
      original_chars: original.length,
    },
  });

  return {
    ok: true,
    draft: { id, class: className, text: improved.text, usedAi: improved.usedAi },
  };
}

async function loadDraft(actor: ResolvedTeacher, id: string) {
  return prisma.announcement.findFirst({
    where: { id, institute_id: actor.instituteId },
  });
}

/** Looks up a draft for the Edit button without changing anything. */
export async function getEditableDraft(
  actor: ResolvedTeacher,
  id: string,
): Promise<DraftResult> {
  const announcement = await loadDraft(actor, id);
  if (!announcement) return { ok: false, reason: "not_found" };
  if (announcement.status !== "draft") return { ok: false, reason: "not_draft" };
  if (!actor.assignedClasses.includes(announcement.class)) {
    return { ok: false, reason: "wrong_class" };
  }

  return {
    ok: true,
    draft: {
      id: announcement.id,
      class: announcement.class,
      text: announcement.text,
      usedAi: false,
    },
  };
}

/** Replaces the text of a draft (AI-improved again, same validator). */
export async function editAnnouncementDraft(
  actor: ResolvedTeacher,
  id: string,
  input: string,
): Promise<DraftResult> {
  const announcement = await loadDraft(actor, id);
  if (!announcement) return { ok: false, reason: "not_found" };
  if (announcement.status !== "draft") return { ok: false, reason: "not_draft" };
  if (!actor.assignedClasses.includes(announcement.class)) {
    return { ok: false, reason: "wrong_class" };
  }

  const original = cleanText(input);
  if (!original) return { ok: false, reason: "empty" };

  const improved = await improvedText(original);

  const updated = await prisma.announcement.updateMany({
    where: { id, institute_id: actor.instituteId, status: "draft" },
    data: { text: improved.text },
  });
  if (updated.count !== 1) return { ok: false, reason: "not_draft" };

  await recordAudit({
    instituteId: actor.instituteId,
    actorType: "teacher",
    actorId: actor.teacherId,
    action: "announcement.edited",
    details: {
      announcement_id: id,
      class: announcement.class,
      ai_used: improved.usedAi,
      original_chars: original.length,
    },
  });

  return {
    ok: true,
    draft: {
      id,
      class: announcement.class,
      text: improved.text,
      usedAi: improved.usedAi,
    },
  };
}

export async function rejectAnnouncementDraft(
  actor: ResolvedTeacher,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: AnnouncementFailureReason }> {
  const announcement = await loadDraft(actor, id);
  if (!announcement) return { ok: false, reason: "not_found" };
  if (announcement.status !== "draft") return { ok: false, reason: "not_draft" };
  if (!actor.assignedClasses.includes(announcement.class)) {
    return { ok: false, reason: "wrong_class" };
  }

  const updated = await prisma.announcement.updateMany({
    where: { id, institute_id: actor.instituteId, status: "draft", delivered_at: null },
    data: { status: "rejected" },
  });
  if (updated.count !== 1) return { ok: false, reason: "not_draft" };

  await recordAudit({
    instituteId: actor.instituteId,
    actorType: "teacher",
    actorId: actor.teacherId,
    action: "announcement.rejected",
    details: { announcement_id: id, class: announcement.class },
  });

  return { ok: true };
}

interface LinkedGuardian {
  id: string;
  telegram_chat_id: string | null;
}

async function linkedGuardiansOfClass(
  instituteId: string,
  className: string,
): Promise<LinkedGuardian[]> {
  const links = await prisma.guardianStudentLink.findMany({
    where: {
      institute_id: instituteId,
      verified: true,
      student: { institute_id: instituteId, class: className },
    },
    select: { guardian: { select: { id: true, telegram_chat_id: true } } },
  });

  const byId = new Map<string, LinkedGuardian>();
  for (const link of links) {
    byId.set(link.guardian.id, link.guardian);
  }
  return [...byId.values()];
}

/**
 * Approves and delivers. The `delivered_at` claim happens before any message,
 * so a duplicate press (or a retry) reports "already delivered" and sends
 * nothing.
 */
export async function approveAndDeliverAnnouncement(
  actor: ResolvedTeacher,
  id: string,
  channel: NotificationChannel,
): Promise<ApproveResult> {
  const announcement = await loadDraft(actor, id);
  if (!announcement) return { ok: false, reason: "not_found" };
  if (!actor.assignedClasses.includes(announcement.class)) {
    return { ok: false, reason: "wrong_class" };
  }
  if (announcement.status === "rejected") return { ok: false, reason: "rejected" };

  const claimed = await prisma.announcement.updateMany({
    where: {
      id,
      institute_id: actor.instituteId,
      status: { not: "rejected" },
      delivered_at: null,
    },
    data: { status: "approved", delivered_at: new Date() },
  });

  if (claimed.count !== 1) {
    const current = await loadDraft(actor, id);
    if (current?.status === "rejected") return { ok: false, reason: "rejected" };
    return {
      ok: true,
      alreadyDelivered: true,
      sent: 0,
      skippedUnlinked: 0,
      failed: 0,
    };
  }

  await recordAudit({
    instituteId: actor.instituteId,
    actorType: "teacher",
    actorId: actor.teacherId,
    action: "announcement.approved",
    details: { announcement_id: id, class: announcement.class },
  });

  const guardians = await linkedGuardiansOfClass(actor.instituteId, announcement.class);

  let sent = 0;
  let skippedUnlinked = 0;
  let failed = 0;

  for (const guardian of guardians) {
    if (!guardian.telegram_chat_id) {
      skippedUnlinked += 1;
      continue;
    }

    const result = await channel.send(guardian.id, announcement.text);
    if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  await recordAudit({
    instituteId: actor.instituteId,
    actorType: "teacher",
    actorId: actor.teacherId,
    action: "announcement.delivery",
    details: {
      announcement_id: id,
      class: announcement.class,
      sent,
      skipped_unlinked: skippedUnlinked,
      failed,
    },
  });

  return { ok: true, alreadyDelivered: false, sent, skippedUnlinked, failed };
}
