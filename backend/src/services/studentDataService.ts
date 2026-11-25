// Authorized data readers for one student.
//
// Every function starts with requireStudentAccess, so a guardian can only read
// data for a child they are verified for, inside their own institute. Nothing
// here talks to Telegram.

import { prisma } from "../db/prisma.js";
import {
  requireStudentAccess,
  type AuthorizedStudent,
} from "./authorizationService.js";
import {
  maxDate,
  summarizeAttendance,
  summarizeFees,
  summarizeMarks,
  type AttendanceSummary,
  type FeeSummary,
  type MarksSummary,
} from "./calculations.js";

export interface AttendanceFacts {
  student: AuthorizedStudent;
  summary: AttendanceSummary | null;
}

export interface MarksFacts {
  student: AuthorizedStudent;
  summary: MarksSummary | null;
}

export interface FeeFacts {
  student: AuthorizedStudent;
  summary: FeeSummary;
  referenceDate: Date | null;
}

export interface AnnouncementItem {
  id: string;
  text: string;
  createdAt: Date;
}

export interface AnnouncementFacts {
  student: AuthorizedStudent;
  announcements: AnnouncementItem[];
  referenceDate: Date | null;
}

/**
 * The demo's "as of" date: the newest attendance or mark record, never the
 * machine clock, so replies keep working when the demo is run later.
 */
async function referenceDateForStudent(student: AuthorizedStudent): Promise<Date | null> {
  const [attendance, mark] = await Promise.all([
    prisma.attendance.findFirst({
      where: { student_id: student.id, institute_id: student.institute_id },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
    prisma.mark.findFirst({
      where: { student_id: student.id, institute_id: student.institute_id },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
  ]);

  return maxDate([attendance?.date, mark?.date]);
}

export async function getReferenceDate(
  chatId: string,
  studentId: string,
): Promise<Date | null> {
  const student = await requireStudentAccess(chatId, studentId);
  return referenceDateForStudent(student);
}

export async function loadAttendanceFacts(
  chatId: string,
  studentId: string,
  windowDays = 30,
): Promise<AttendanceFacts> {
  const student = await requireStudentAccess(chatId, studentId);

  const rows = await prisma.attendance.findMany({
    where: { student_id: student.id, institute_id: student.institute_id },
    orderBy: { date: "asc" },
    select: { date: true, status: true },
  });

  return { student, summary: summarizeAttendance(rows, windowDays) };
}

export async function loadMarksFacts(
  chatId: string,
  studentId: string,
): Promise<MarksFacts> {
  const student = await requireStudentAccess(chatId, studentId);

  const rows = await prisma.mark.findMany({
    where: { student_id: student.id, institute_id: student.institute_id },
    orderBy: [{ date: "asc" }, { test_name: "asc" }],
    select: {
      subject: true,
      test_name: true,
      score: true,
      max_score: true,
      date: true,
    },
  });

  return { student, summary: summarizeMarks(rows) };
}

export async function loadFeeFacts(
  chatId: string,
  studentId: string,
): Promise<FeeFacts> {
  const student = await requireStudentAccess(chatId, studentId);

  const [rows, referenceDate] = await Promise.all([
    prisma.fee.findMany({
      where: { student_id: student.id, institute_id: student.institute_id },
      orderBy: { due_date: "asc" },
      select: { amount: true, due_date: true, paid: true },
    }),
    referenceDateForStudent(student),
  ]);

  return {
    student,
    summary: summarizeFees(
      rows.map((row) => ({
        amount: Number(row.amount.toString()),
        due_date: row.due_date,
        paid: row.paid,
      })),
      referenceDate,
    ),
    referenceDate,
  };
}

export async function loadAnnouncementFacts(
  chatId: string,
  studentId: string,
): Promise<AnnouncementFacts> {
  const student = await requireStudentAccess(chatId, studentId);

  const [rows, referenceDate] = await Promise.all([
    prisma.announcement.findMany({
      where: {
        institute_id: student.institute_id,
        class: student.class,
        // Draft and rejected announcements are never shown to parents.
        status: "approved",
      },
      orderBy: { created_at: "desc" },
      select: { id: true, text: true, created_at: true },
    }),
    referenceDateForStudent(student),
  ]);

  return {
    student,
    announcements: rows.map((row) => ({
      id: row.id,
      text: row.text,
      createdAt: row.created_at,
    })),
    referenceDate,
  };
}
