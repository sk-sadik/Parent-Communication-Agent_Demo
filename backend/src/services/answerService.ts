// Rule-based question answering. No AI calls: every number comes from
// calculations over authorized database rows.
//
// Telegram-independent: the bot calls these functions and only sends the text.

import type { Language } from "../generated/prisma/enums.js";
import { messages } from "../telegram/messages.js";
import {
  announcementsReply,
  attendanceReply,
  feesReply,
  marksReply,
} from "../telegram/replies.js";
import { classifyQuestion, type QuestionCategory } from "./classifier.js";
import {
  AuthorizationError,
  getAuthorizedStudents,
  resolveActorByChatId,
  type AuthorizedStudent,
  type ResolvedGuardian,
} from "./authorizationService.js";
import { recordAudit } from "./auditService.js";
import {
  loadAnnouncementFacts,
  loadAttendanceFacts,
  loadFeeFacts,
  loadMarksFacts,
} from "./studentDataService.js";

export type AnswerKind =
  | "answer"
  | "choose_child"
  | "other"
  | "no_data"
  | "no_children"
  | "forbidden"
  | "unknown"
  | "teacher";

export interface AnswerOption {
  studentId: string;
  name: string;
}

export interface AnswerResult {
  kind: AnswerKind;
  category: QuestionCategory;
  text: string;
  studentId?: string;
  options?: AnswerOption[];
}

const MAX_AUDIT_QUESTION = 500;

function auditQuestion(
  actor: ResolvedGuardian,
  category: QuestionCategory,
  text: string,
  studentId?: string,
): Promise<void> {
  return recordAudit({
    instituteId: actor.instituteId,
    actorType: "guardian",
    actorId: actor.guardianId,
    action: "question.received",
    details: {
      channel: "telegram",
      category,
      text: text.slice(0, MAX_AUDIT_QUESTION),
      ...(studentId ? { student_id: studentId } : {}),
    },
  });
}

function auditAnswer(
  actor: ResolvedGuardian,
  category: QuestionCategory,
  text: string,
  studentId?: string,
): Promise<void> {
  return recordAudit({
    instituteId: actor.instituteId,
    actorType: "guardian",
    actorId: actor.guardianId,
    action: "answer.sent",
    details: {
      channel: "telegram",
      category,
      text,
      ...(studentId ? { student_id: studentId } : {}),
    },
  });
}

/**
 * Finds the child named in the message, if any. Matching is deliberately
 * simple (full name or first name) so the demo never guesses between children.
 */
function matchStudent(
  question: string,
  students: readonly AuthorizedStudent[],
): AuthorizedStudent | null {
  const text = question.toLowerCase();
  const matches = students.filter((student) => {
    const full = student.name.toLowerCase();
    const first = full.split(/\s+/)[0] ?? "";
    return text.includes(full) || (first.length >= 3 && text.includes(first));
  });

  return matches.length === 1 ? (matches[0] ?? null) : null;
}

async function answerForStudent(
  chatId: string,
  guardian: ResolvedGuardian,
  category: Exclude<QuestionCategory, "other">,
  studentId: string,
  questionText: string,
): Promise<AnswerResult> {
  const language: Language = guardian.language;

  let text = "";
  let kind: AnswerKind = "answer";

  try {
    // Every loader starts with requireStudentAccess, so the student id can
    // never widen access, even when it arrives from callback data.
    switch (category) {
      case "attendance": {
        const facts = await loadAttendanceFacts(chatId, studentId);
        if (facts.summary) {
          text = attendanceReply(facts.student, facts.summary, language);
        } else {
          text = messages.noData(category, facts.student.name, language);
          kind = "no_data";
        }
        break;
      }

      case "marks": {
        const facts = await loadMarksFacts(chatId, studentId);
        if (facts.summary) {
          text = marksReply(facts.student, facts.summary, language);
        } else {
          text = messages.noData(category, facts.student.name, language);
          kind = "no_data";
        }
        break;
      }

      case "fees": {
        const facts = await loadFeeFacts(chatId, studentId);
        text = feesReply(facts.student, facts.summary, facts.referenceDate, language);
        break;
      }

      case "announcements": {
        const facts = await loadAnnouncementFacts(chatId, studentId);
        text = announcementsReply(
          facts.student,
          facts.announcements,
          facts.referenceDate,
          language,
        );
        break;
      }
    }
  } catch (error) {
    if (error instanceof AuthorizationError) {
      // A forged callback or a student id from another family: return no data.
      await recordAudit({
        instituteId: guardian.instituteId,
        actorType: "guardian",
        actorId: guardian.guardianId,
        action: "answer.denied",
        details: { channel: "telegram", category, student_id: studentId },
      });
      return {
        kind: "forbidden",
        category,
        text: messages.notAllowed(language),
      };
    }
    throw error;
  }

  if (questionText.trim()) {
    await auditQuestion(guardian, category, questionText, studentId);
  }
  await auditAnswer(guardian, category, text, studentId);

  return { kind, category, text, studentId };
}

/**
 * Main entry point for a free-text question from a linked guardian.
 */
export async function answerQuestion(
  chatId: string,
  question: string,
): Promise<AnswerResult> {
  const actor = await resolveActorByChatId(chatId);

  if (!actor) {
    return { kind: "unknown", category: "other", text: messages.unknownChat() };
  }

  if (actor.kind === "teacher") {
    return { kind: "teacher", category: "other", text: messages.teacherPlaceholder() };
  }

  const category = classifyQuestion(question);
  const students = await getAuthorizedStudents(chatId);

  if (students.length === 0) {
    const text = messages.noChildren(actor.language);
    await auditQuestion(actor, category, question);
    await auditAnswer(actor, category, text);
    return { kind: "no_children", category, text };
  }

  if (category === "other") {
    const text = messages.otherQuestion(actor.language);
    await auditQuestion(actor, category, question);
    await auditAnswer(actor, category, text);
    return { kind: "other", category, text };
  }

  const matched = matchStudent(question, students);

  if (!matched && students.length > 1) {
    const text = messages.chooseChild(actor.language);
    await auditQuestion(actor, category, question);
    return {
      kind: "choose_child",
      category,
      text,
      options: students.map((student) => ({ studentId: student.id, name: student.name })),
    };
  }

  const student = matched ?? students[0];
  if (!student) {
    const text = messages.noChildren(actor.language);
    await auditQuestion(actor, category, question);
    await auditAnswer(actor, category, text);
    return { kind: "no_children", category, text };
  }

  return answerForStudent(chatId, actor, category, student.id, question);
}

/**
 * Used by the inline child buttons. The student id is untrusted input, so the
 * loader's authorization check decides whether anything is returned.
 */
export async function answerQuestionForStudent(
  chatId: string,
  studentId: string,
  category: Exclude<QuestionCategory, "other">,
): Promise<AnswerResult> {
  const actor = await resolveActorByChatId(chatId);

  if (!actor) {
    return { kind: "unknown", category, text: messages.unknownChat() };
  }
  if (actor.kind === "teacher") {
    return { kind: "teacher", category, text: messages.teacherPlaceholder() };
  }

  return answerForStudent(chatId, actor, category, studentId, "");
}
