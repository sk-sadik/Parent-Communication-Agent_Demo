import { Bot, InlineKeyboard, type Context } from "grammy";
import type { FastifyBaseLogger } from "fastify";
import { redeemActivationCode, setGuardianLanguage } from "../services/activationService.js";
import { answerQuestion, answerQuestionForStudent } from "../services/answerService.js";
import type { QuestionCategory } from "../services/classifier.js";
import {
  resolveActorByChatId,
  resolveTeacherCommand,
  type ResolvedTeacher,
} from "../services/authorizationService.js";
import {
  approveAndDeliverAnnouncement,
  createAnnouncementDraft,
  editAnnouncementDraft,
  getEditableDraft,
  rejectAnnouncementDraft,
} from "../services/announcementService.js";
import {
  getOpenEscalationForTeacher,
  listOpenEscalations,
  notifyEscalationTeacher,
  replyToEscalation,
} from "../services/escalationWorkflowService.js";
import { triggerFeeReminders } from "../services/feeReminderService.js";
import type { NotificationChannel } from "../notifications/channel.js";
import { TelegramChannel } from "../notifications/telegramChannel.js";
import type { Language } from "../generated/prisma/enums.js";
import { describeError } from "./errors.js";
import { isLanguageChangeRequest } from "./languageIntent.js";
import { messages } from "./messages.js";

export interface CreateBotOptions {
  token: string;
  logger: FastifyBaseLogger;
}

type PendingInput =
  | { kind: "announcement" }
  | { kind: "announcement_edit"; announcementId: string }
  | { kind: "escalation_reply"; escalationId: string; studentName: string };

interface BotDeps {
  logger: FastifyBaseLogger;
  channel: NotificationChannel;
  /** Pending text input per chat. One bot process, so an in-memory map is enough. */
  pending: Map<string, PendingInput>;
}

function chatIdOf(ctx: Context): string | null {
  const id = ctx.chat?.id ?? ctx.from?.id;
  return id === undefined ? null : String(id);
}

function languageKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("English", "lang:en").text("తెలుగు", "lang:te");
}

function draftKeyboard(announcementId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("Approve", `ann:approve:${announcementId}`)
    .text("Edit", `ann:edit:${announcementId}`)
    .text("Reject", `ann:reject:${announcementId}`);
}

async function answerCallback(ctx: Context): Promise<void> {
  try {
    await ctx.answerCallbackQuery();
  } catch {
    // Expired callback queries are harmless.
  }
}

async function safely(
  ctx: Context,
  logger: FastifyBaseLogger,
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    logger.error(`Telegram handler failed: ${describeError(error)}`);
    try {
      await ctx.reply(messages.genericError());
    } catch {
      // The user may have blocked the bot; nothing else to do.
    }
  }
}

async function sendDraftCard(
  ctx: Context,
  draft: { id: string; class: string; text: string; usedAi: boolean },
): Promise<void> {
  await ctx.reply(messages.announceDraft(draft.class, draft.text, draft.usedAi), {
    reply_markup: draftKeyboard(draft.id),
  });
}

/**
 * Teacher-command guard. Guardians get a polite refusal, unknown chats get the
 * linking instructions, and a teacher without a class is told to contact the
 * school. Never returns a teacher for a parent.
 */
async function requireTeacher(ctx: Context, deps: BotDeps): Promise<ResolvedTeacher | null> {
  const chatId = chatIdOf(ctx);
  if (!chatId) return null;

  const guard = await resolveTeacherCommand(chatId);
  if (guard.ok) return guard.teacher;

  if (guard.reason === "unknown_chat") {
    await ctx.reply(messages.unknownChat());
    return null;
  }

  if (guard.reason === "not_teacher") {
    const actor = await resolveActorByChatId(chatId);
    const language: Language = actor?.kind === "guardian" ? actor.language : "en";
    await ctx.reply(messages.teacherOnly(language));
    return null;
  }

  await ctx.reply(messages.teacherNoClass());
  return null;
}

async function handleStart(ctx: Context, deps: BotDeps): Promise<void> {
  await safely(ctx, deps.logger, async () => {
    const chatId = chatIdOf(ctx);
    if (!chatId) return;

    const raw = typeof ctx.match === "string" ? ctx.match.trim() : "";
    const code = raw.split(/\s+/)[0] ?? "";

    // A linked parent who sends /start again wants the language options, not a
    // new activation code.
    const actor = await resolveActorByChatId(chatId);

    if (!code) {
      if (actor?.kind === "guardian") {
        await ctx.reply(messages.languagePrompt(actor.name), {
          reply_markup: languageKeyboard(),
        });
        return;
      }
      if (actor?.kind === "teacher") {
        await ctx.reply(messages.teacherHelp());
        return;
      }
      await ctx.reply(messages.needCode());
      return;
    }

    if (actor) {
      await ctx.reply(messages.alreadyLinked());
      return;
    }

    const result = await redeemActivationCode({ code, chatId });

    if (!result.ok) {
      const message =
        result.reason === "already_linked" || result.reason === "target_already_linked"
          ? messages.alreadyLinked()
          : messages.linkFailed();
      await ctx.reply(message);
      return;
    }

    if (result.role === "guardian") {
      deps.logger.info("Guardian linked through an activation code");
      await ctx.reply(messages.languagePrompt(result.name), {
        reply_markup: languageKeyboard(),
      });
      return;
    }

    deps.logger.info("Teacher linked through an activation code");
    await ctx.reply(messages.teacherLinked(result.name, result.assignedClass));
  });
}

async function handleLanguageChoice(ctx: Context, deps: BotDeps): Promise<void> {
  await safely(ctx, deps.logger, async () => {
    const choice = Array.isArray(ctx.match) ? ctx.match[1] : undefined;
    if (choice !== "en" && choice !== "te") return;
    const language: Language = choice;

    await answerCallback(ctx);

    const chatId = chatIdOf(ctx);
    if (!chatId) return;

    const result = await setGuardianLanguage(chatId, language);
    if (!result.ok) {
      await ctx.reply(messages.languageNotAvailable());
      return;
    }

    await ctx.reply(messages.welcome(result.name, result.language));
  });
}

async function handleLanguageCommand(ctx: Context, deps: BotDeps): Promise<void> {
  await safely(ctx, deps.logger, async () => {
    const chatId = chatIdOf(ctx);
    if (!chatId) return;

    const actor = await resolveActorByChatId(chatId);
    if (!actor) {
      await ctx.reply(messages.unknownChat());
      return;
    }
    if (actor.kind === "teacher") {
      await ctx.reply(messages.teacherHelp());
      return;
    }

    await ctx.reply(messages.languagePrompt(actor.name), {
      reply_markup: languageKeyboard(),
    });
  });
}

async function handleAnnounce(ctx: Context, deps: BotDeps): Promise<void> {
  await safely(ctx, deps.logger, async () => {
    const teacher = await requireTeacher(ctx, deps);
    if (!teacher) return;

    const chatId = chatIdOf(ctx);
    if (!chatId) return;

    const text = typeof ctx.match === "string" ? ctx.match.trim() : "";

    if (!text) {
      deps.pending.set(chatId, { kind: "announcement" });
      await ctx.reply(messages.announcePrompt());
      return;
    }

    const result = await createAnnouncementDraft(teacher, text);
    if (!result.ok) {
      await ctx.reply(result.reason === "empty" ? messages.announceEmpty() : messages.teacherNoClass());
      return;
    }

    await sendDraftCard(ctx, result.draft);
  });
}

async function handleEscalations(ctx: Context, deps: BotDeps): Promise<void> {
  await safely(ctx, deps.logger, async () => {
    const teacher = await requireTeacher(ctx, deps);
    if (!teacher) return;

    const rows = await listOpenEscalations(teacher);
    const className = teacher.assignedClasses[0] ?? "";
    const keyboard = new InlineKeyboard();
    rows.forEach((row, index) => {
      keyboard.text(`Reply ${index + 1}`, `esc:reply:${row.id}`).row();
    });

    await ctx.reply(messages.escalationList(className, rows), {
      ...(rows.length > 0 ? { reply_markup: keyboard } : {}),
    });
  });
}

async function handleFeeReminder(ctx: Context, deps: BotDeps): Promise<void> {
  await safely(ctx, deps.logger, async () => {
    const teacher = await requireTeacher(ctx, deps);
    if (!teacher) return;

    const report = await triggerFeeReminders(teacher, deps.channel);
    await ctx.reply(messages.feeReminderReport(report));
  });
}

async function handleCancel(ctx: Context, deps: BotDeps): Promise<void> {
  await safely(ctx, deps.logger, async () => {
    const chatId = chatIdOf(ctx);
    if (!chatId) return;

    const actor = await resolveActorByChatId(chatId);
    if (!actor) {
      await ctx.reply(messages.unknownChat());
      return;
    }

    // A parent may send /cancel too; answer safely instead of showing the
    // teacher command list.
    deps.pending.delete(chatId);
    await ctx.reply(messages.cancelled());
  });
}

async function handleAnnouncementCallback(
  ctx: Context,
  deps: BotDeps,
  action: string,
  announcementId: string,
): Promise<void> {
  await safely(ctx, deps.logger, async () => {
    await answerCallback(ctx);

    const teacher = await requireTeacher(ctx, deps);
    if (!teacher) return;

    if (action === "approve") {
      const result = await approveAndDeliverAnnouncement(teacher, announcementId, deps.channel);
      if (!result.ok) {
        await ctx.reply(
          result.reason === "rejected"
            ? messages.announceRejectedReminder()
            : messages.announceNotDraft(),
        );
        return;
      }
      await ctx.reply(messages.announceDeliveryReport(result));
      return;
    }

    if (action === "edit") {
      const editable = await getEditableDraft(teacher, announcementId);
      if (!editable.ok) {
        await ctx.reply(messages.announceNotDraft());
        return;
      }

      const chatId = chatIdOf(ctx);
      if (!chatId) return;
      deps.pending.set(chatId, { kind: "announcement_edit", announcementId });
      await ctx.reply(messages.announceEditPrompt());
      return;
    }

    const rejected = await rejectAnnouncementDraft(teacher, announcementId);
    if (!rejected.ok) {
      await ctx.reply(messages.announceNotDraft());
      return;
    }
    await ctx.reply(messages.announceRejected());
  });
}

async function handleEscalationReplyCallback(
  ctx: Context,
  deps: BotDeps,
  escalationId: string,
): Promise<void> {
  await safely(ctx, deps.logger, async () => {
    await answerCallback(ctx);

    const teacher = await requireTeacher(ctx, deps);
    if (!teacher) return;

    const entry = await getOpenEscalationForTeacher(teacher, escalationId);
    if (!entry) {
      await ctx.reply(messages.escalationUnavailable());
      return;
    }

    const chatId = chatIdOf(ctx);
    if (!chatId) return;
    deps.pending.set(chatId, {
      kind: "escalation_reply",
      escalationId,
      studentName: entry.studentName,
    });
    await ctx.reply(messages.escalationReplyPrompt(entry.studentName, entry.question));
  });
}

async function handlePendingInput(
  ctx: Context,
  deps: BotDeps,
  teacher: ResolvedTeacher,
  pending: PendingInput,
  text: string,
): Promise<void> {
  const chatId = chatIdOf(ctx);
  if (!chatId) return;

  deps.pending.delete(chatId);

  if (pending.kind === "announcement") {
    const result = await createAnnouncementDraft(teacher, text);
    if (!result.ok) {
      await ctx.reply(result.reason === "empty" ? messages.announceEmpty() : messages.teacherNoClass());
      return;
    }
    await sendDraftCard(ctx, result.draft);
    return;
  }

  if (pending.kind === "announcement_edit") {
    const result = await editAnnouncementDraft(teacher, pending.announcementId, text);
    if (!result.ok) {
      await ctx.reply(
        result.reason === "empty" ? messages.announceEmpty() : messages.announceNotDraft(),
      );
      return;
    }
    await sendDraftCard(ctx, result.draft);
    return;
  }

  const result = await replyToEscalation(
    teacher,
    pending.escalationId,
    text,
    deps.channel,
  );

  if (result.ok) {
    await ctx.reply(messages.escalationReplySent());
    return;
  }

  switch (result.reason) {
    case "empty":
      await ctx.reply(messages.escalationReplyEmpty());
      break;
    case "closed":
      await ctx.reply(messages.escalationReplyClosed());
      break;
    case "wrong_class":
      await ctx.reply(messages.escalationReplyWrongClass());
      break;
    case "delivery_failed":
      await ctx.reply(messages.escalationReplyFailed("Telegram delivery failed"));
      break;
    default:
      await ctx.reply(messages.escalationNotFound());
  }
}

async function handleOtherMessage(ctx: Context, deps: BotDeps): Promise<void> {
  await safely(ctx, deps.logger, async () => {
    const chatId = chatIdOf(ctx);
    if (!chatId) {
      await ctx.reply(messages.unknownChat());
      return;
    }

    const actor = await resolveActorByChatId(chatId);
    if (!actor) {
      await ctx.reply(messages.unknownChat());
      return;
    }

    const question = ctx.message?.text ?? "";

    if (actor.kind === "teacher") {
      const pending = deps.pending.get(chatId);
      if (pending) {
        const text = question.trim();
        if (!text) {
          await ctx.reply(messages.announcePrompt());
          return;
        }
        await handlePendingInput(ctx, deps, actor, pending, text);
        return;
      }

      await ctx.reply(messages.teacherHelp());
      return;
    }

    // "change language to English", "భాష మార్చండి", ... show the picker instead
    // of being classified as a school question.
    if (isLanguageChangeRequest(question)) {
      await ctx.reply(messages.languagePrompt(actor.name), {
        reply_markup: languageKeyboard(),
      });
      return;
    }

    const result = await answerQuestion(chatId, question);

    if (result.kind === "escalated" && result.escalationId) {
      // The teacher is notified once, right after the escalation is created.
      const notified = await notifyEscalationTeacher(result.escalationId, deps.channel);
      if (!notified.notified) {
        deps.logger.warn(
          `Escalation teacher notification skipped: ${notified.reason ?? "unknown"}`,
        );
      }
    }

    if (result.kind === "choose_child" && result.options?.length) {
      const keyboard = new InlineKeyboard();
      for (const option of result.options) {
        // The callback only carries ids; the answer service re-checks access.
        keyboard.text(option.name, `ask:${result.category}:${option.studentId}`).row();
      }
      await ctx.reply(result.text, { reply_markup: keyboard });
      return;
    }

    await ctx.reply(result.text);
  });
}

const ASK_PATTERN = /^ask:(attendance|marks|progress|fees|announcements):([A-Za-z0-9_-]+)$/;
const ANNOUNCEMENT_PATTERN = /^ann:(approve|edit|reject):([A-Za-z0-9-]+)$/;
const ESCALATION_REPLY_PATTERN = /^esc:reply:([A-Za-z0-9-]+)$/;

async function handleChildChoice(ctx: Context, deps: BotDeps): Promise<void> {
  await safely(ctx, deps.logger, async () => {
    const match = Array.isArray(ctx.match) ? ctx.match : [];
    const category = match[1] as Exclude<QuestionCategory, "other"> | undefined;
    const studentId = match[2];
    if (!category || !studentId) return;

    await answerCallback(ctx);

    const chatId = chatIdOf(ctx);
    if (!chatId) return;

    const result = await answerQuestionForStudent(chatId, studentId, category);
    await ctx.reply(result.text);
  });
}

/**
 * Builds the grammY bot (long polling). All business logic lives in the
 * services, so this function is only wiring: it is never called by tests.
 */
export function createBot({ token, logger }: CreateBotOptions): Bot {
  const bot = new Bot(token);

  const deps: BotDeps = {
    logger,
    channel: new TelegramChannel(bot.api),
    pending: new Map<string, PendingInput>(),
  };

  // Any unhandled update error is logged and swallowed: a bad update must not
  // crash the process.
  bot.catch((error) => {
    logger.error(`Unhandled Telegram update error: ${describeError(error.error)}`);
  });

  bot.command("start", (ctx) => handleStart(ctx, deps));
  bot.command("language", (ctx) => handleLanguageCommand(ctx, deps));
  bot.command("lang", (ctx) => handleLanguageCommand(ctx, deps));
  bot.command("announce", (ctx) => handleAnnounce(ctx, deps));
  bot.command("escalations", (ctx) => handleEscalations(ctx, deps));
  bot.command("trigger_fee_reminder", (ctx) => handleFeeReminder(ctx, deps));
  bot.command("cancel", (ctx) => handleCancel(ctx, deps));
  bot.callbackQuery(/^lang:(en|te)$/, (ctx) => handleLanguageChoice(ctx, deps));
  bot.callbackQuery(ASK_PATTERN, (ctx) => handleChildChoice(ctx, deps));
  bot.callbackQuery(ANNOUNCEMENT_PATTERN, (ctx) => {
    const match = Array.isArray(ctx.match) ? ctx.match : [];
    const action = match[1] ?? "";
    const announcementId = match[2] ?? "";
    return handleAnnouncementCallback(ctx, deps, action, announcementId);
  });
  bot.callbackQuery(ESCALATION_REPLY_PATTERN, (ctx) => {
    const match = Array.isArray(ctx.match) ? ctx.match : [];
    return handleEscalationReplyCallback(ctx, deps, match[1] ?? "");
  });
  bot.on("message", (ctx) => handleOtherMessage(ctx, deps));

  return bot;
}
