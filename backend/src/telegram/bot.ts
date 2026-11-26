import { Bot, InlineKeyboard, type Context } from "grammy";
import type { FastifyBaseLogger } from "fastify";
import { redeemActivationCode, setGuardianLanguage } from "../services/activationService.js";
import { answerQuestion, answerQuestionForStudent } from "../services/answerService.js";
import type { QuestionCategory } from "../services/classifier.js";
import { resolveActorByChatId } from "../services/authorizationService.js";
import type { Language } from "../generated/prisma/enums.js";
import { describeError } from "./errors.js";
import { isLanguageChangeRequest } from "./languageIntent.js";
import { messages } from "./messages.js";

export interface CreateBotOptions {
  token: string;
  logger: FastifyBaseLogger;
}

function chatIdOf(ctx: Context): string | null {
  const id = ctx.chat?.id ?? ctx.from?.id;
  return id === undefined ? null : String(id);
}

function languageKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("English", "lang:en").text("తెలుగు", "lang:te");
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

async function handleStart(ctx: Context, logger: FastifyBaseLogger): Promise<void> {
  await safely(ctx, logger, async () => {
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
        await ctx.reply(messages.teacherPlaceholder());
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
      logger.info("Guardian linked through an activation code");
      await ctx.reply(messages.languagePrompt(result.name), {
        reply_markup: languageKeyboard(),
      });
      return;
    }

    logger.info("Teacher linked through an activation code");
    await ctx.reply(messages.teacherLinked(result.name, result.assignedClass));
  });
}

async function handleLanguageChoice(ctx: Context, logger: FastifyBaseLogger): Promise<void> {
  await safely(ctx, logger, async () => {
    const choice = Array.isArray(ctx.match) ? ctx.match[1] : undefined;
    if (choice !== "en" && choice !== "te") return;
    const language: Language = choice;

    try {
      await ctx.answerCallbackQuery();
    } catch {
      // Expired callback queries are harmless.
    }

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

async function handleLanguageCommand(ctx: Context, logger: FastifyBaseLogger): Promise<void> {
  await safely(ctx, logger, async () => {
    const chatId = chatIdOf(ctx);
    if (!chatId) return;

    const actor = await resolveActorByChatId(chatId);
    if (!actor) {
      await ctx.reply(messages.unknownChat());
      return;
    }
    if (actor.kind === "teacher") {
      await ctx.reply(messages.teacherPlaceholder());
      return;
    }

    await ctx.reply(messages.languagePrompt(actor.name), {
      reply_markup: languageKeyboard(),
    });
  });
}

async function handleOtherMessage(ctx: Context, logger: FastifyBaseLogger): Promise<void> {
  await safely(ctx, logger, async () => {
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

    if (actor.kind === "teacher") {
      await ctx.reply(messages.teacherPlaceholder());
      return;
    }

    const question = ctx.message?.text ?? "";

    // "change language to English", "భాష మార్చండి", ... show the picker instead
    // of being classified as a school question.
    if (isLanguageChangeRequest(question)) {
      await ctx.reply(messages.languagePrompt(actor.name), {
        reply_markup: languageKeyboard(),
      });
      return;
    }

    const result = await answerQuestion(chatId, question);

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

async function handleChildChoice(ctx: Context, logger: FastifyBaseLogger): Promise<void> {
  await safely(ctx, logger, async () => {
    const match = Array.isArray(ctx.match) ? ctx.match : [];
    const category = match[1] as Exclude<QuestionCategory, "other"> | undefined;
    const studentId = match[2];
    if (!category || !studentId) return;

    try {
      await ctx.answerCallbackQuery();
    } catch {
      // Expired callback queries are harmless.
    }

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

  // Any unhandled update error is logged and swallowed: a bad update must not
  // crash the process.
  bot.catch((error) => {
    logger.error(`Unhandled Telegram update error: ${describeError(error.error)}`);
  });

  bot.command("start", (ctx) => handleStart(ctx, logger));
  bot.command("language", (ctx) => handleLanguageCommand(ctx, logger));
  bot.command("lang", (ctx) => handleLanguageCommand(ctx, logger));
  bot.callbackQuery(/^lang:(en|te)$/, (ctx) => handleLanguageChoice(ctx, logger));
  bot.callbackQuery(ASK_PATTERN, (ctx) => handleChildChoice(ctx, logger));
  bot.on("message", (ctx) => handleOtherMessage(ctx, logger));

  return bot;
}
