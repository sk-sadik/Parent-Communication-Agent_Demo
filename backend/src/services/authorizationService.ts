// Central authorization service.
//
// Every future data access must go through this module: telegram chat_id ->
// guardian/teacher -> allowed students or classes, always inside one institute.
// Nothing here talks to Telegram, so it can be unit tested directly.

import { prisma } from "../db/prisma.js";
import type { Language } from "../generated/prisma/enums.js";

export interface AuthorizedStudent {
  id: string;
  name: string;
  class: string;
  roll_number: string;
  institute_id: string;
}

export interface ResolvedGuardian {
  kind: "guardian";
  guardianId: string;
  instituteId: string;
  name: string;
  language: Language;
  studentIds: string[];
}

export interface ResolvedTeacher {
  kind: "teacher";
  teacherId: string;
  instituteId: string;
  name: string;
  assignedClasses: string[];
}

export type ResolvedActor = ResolvedGuardian | ResolvedTeacher;

export class AuthorizationError extends Error {
  readonly code = "forbidden";

  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function resolveActorByChatId(chatId: string): Promise<ResolvedActor | null> {
  const guardian = await prisma.guardian.findUnique({
    where: { telegram_chat_id: chatId },
    include: {
      links: {
        where: { verified: true },
        include: { student: true },
      },
    },
  });

  if (guardian) {
    // Defence in depth: only verified links that also agree on the institute
    // count as authorized, even if a bad row slipped into the database.
    const studentIds = [
      ...new Set(
        guardian.links
          .filter(
            (link) =>
              link.institute_id === guardian.institute_id &&
              link.student.institute_id === guardian.institute_id,
          )
          .map((link) => link.student_id),
      ),
    ].sort();

    return {
      kind: "guardian",
      guardianId: guardian.id,
      instituteId: guardian.institute_id,
      name: guardian.name,
      language: guardian.language,
      studentIds,
    };
  }

  const teacher = await prisma.teacher.findUnique({ where: { telegram_chat_id: chatId } });
  if (teacher) {
    return {
      kind: "teacher",
      teacherId: teacher.id,
      instituteId: teacher.institute_id,
      name: teacher.name,
      assignedClasses: [teacher.assigned_class],
    };
  }

  return null;
}

export async function getAuthorizedStudentIds(chatId: string): Promise<string[]> {
  const actor = await resolveActorByChatId(chatId);
  if (!actor || actor.kind !== "guardian") return [];
  return actor.studentIds;
}

export async function getAuthorizedStudents(chatId: string): Promise<AuthorizedStudent[]> {
  const actor = await resolveActorByChatId(chatId);
  if (!actor || actor.kind !== "guardian" || actor.studentIds.length === 0) return [];

  const students = await prisma.student.findMany({
    where: {
      id: { in: actor.studentIds },
      institute_id: actor.instituteId,
    },
    orderBy: { name: "asc" },
  });

  return students.map((student) => ({
    id: student.id,
    name: student.name,
    class: student.class,
    roll_number: student.roll_number,
    institute_id: student.institute_id,
  }));
}

export async function isStudentAuthorized(chatId: string, studentId: string): Promise<boolean> {
  const students = await getAuthorizedStudents(chatId);
  return students.some((student) => student.id === studentId);
}

export async function requireStudentAccess(
  chatId: string,
  studentId: string,
): Promise<AuthorizedStudent> {
  const students = await getAuthorizedStudents(chatId);
  const student = students.find((candidate) => candidate.id === studentId);
  if (!student) {
    throw new AuthorizationError("Guardian is not allowed to access this student");
  }
  return student;
}

export async function getAuthorizedClasses(chatId: string): Promise<string[]> {
  const actor = await resolveActorByChatId(chatId);
  if (!actor || actor.kind !== "teacher") return [];
  return actor.assignedClasses;
}

export async function isClassAuthorized(chatId: string, className: string): Promise<boolean> {
  const classes = await getAuthorizedClasses(chatId);
  return classes.includes(className);
}

export async function requireClassAccess(chatId: string, className: string): Promise<void> {
  const allowed = await isClassAuthorized(chatId, className);
  if (!allowed) {
    throw new AuthorizationError("Teacher is not assigned to this class");
  }
}
