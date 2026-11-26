// The one interface every outbound parent/teacher message goes through.
//
// Phase 5 delivers announcements, teacher replies and fee reminders, so the
// services depend on this interface instead of grammY. Tests inject a fake
// channel and never touch the Telegram API.

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface SendOptions {
  /** Rows of inline buttons. Plain text is always used, never parse modes. */
  inlineKeyboard?: InlineKeyboardButton[][];
}

export type SendFailureReason = "unlinked" | "blocked" | "error";

export interface SendResult {
  ok: boolean;
  /** Set when ok is false. Never contains a chat id or a secret. */
  reason?: SendFailureReason;
}

export interface NotificationChannel {
  /** Sends to a guardian's linked Telegram chat. */
  send(guardianId: string, message: string, options?: SendOptions): Promise<SendResult>;
  /** Sends to a teacher's linked Telegram chat. */
  sendToTeacher(teacherId: string, message: string, options?: SendOptions): Promise<SendResult>;
}
