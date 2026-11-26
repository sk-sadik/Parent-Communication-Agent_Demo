// Telegram implementation of NotificationChannel.
//
// It resolves a guardian/teacher id to their saved chat id and sends plain
// text. Any Telegram error is turned into a safe reason: callers never see a
// stack trace, chat id or token.

import { prisma } from "../db/prisma.js";
import type {
  InlineKeyboardButton,
  NotificationChannel,
  SendOptions,
  SendResult,
} from "./channel.js";

const MAX_MESSAGE = 4000; // Telegram's hard limit is 4096; keep a margin.

/** The small part of grammY's Api this channel needs (easy to fake in tests). */
export interface TelegramSender {
  sendMessage(
    chatId: string | number,
    text: string,
    other?: { reply_markup?: { inline_keyboard: InlineKeyboardButton[][] } },
  ): Promise<unknown>;
}

function failureReason(error: unknown): "blocked" | "error" {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b403\b|blocked|deactivated|chat not found|user is deactivated/i.test(message)) {
    return "blocked";
  }
  return "error";
}

export class TelegramChannel implements NotificationChannel {
  constructor(private readonly sender: TelegramSender) {}

  private async sendToChat(
    chatId: string | null,
    message: string,
    options: SendOptions = {},
  ): Promise<SendResult> {
    if (!chatId) return { ok: false, reason: "unlinked" };

    try {
      await this.sender.sendMessage(chatId, message.slice(0, MAX_MESSAGE), {
        ...(options.inlineKeyboard?.length
          ? { reply_markup: { inline_keyboard: options.inlineKeyboard } }
          : {}),
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: failureReason(error) };
    }
  }

  async send(guardianId: string, message: string, options?: SendOptions): Promise<SendResult> {
    const guardian = await prisma.guardian.findUnique({
      where: { id: guardianId },
      select: { telegram_chat_id: true },
    });
    return this.sendToChat(guardian?.telegram_chat_id ?? null, message, options);
  }

  async sendToTeacher(
    teacherId: string,
    message: string,
    options?: SendOptions,
  ): Promise<SendResult> {
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { telegram_chat_id: true },
    });
    return this.sendToChat(teacher?.telegram_chat_id ?? null, message, options);
  }
}
