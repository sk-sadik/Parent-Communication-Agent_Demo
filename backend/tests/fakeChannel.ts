// In-memory NotificationChannel for tests. No Telegram, no network.

import type {
  NotificationChannel,
  SendOptions,
  SendResult,
} from "../src/notifications/channel.js";

export interface RecordedSend {
  recipientId: string;
  message: string;
  options?: SendOptions;
}

export class FakeNotificationChannel implements NotificationChannel {
  readonly guardianSends: RecordedSend[] = [];
  readonly teacherSends: RecordedSend[] = [];

  /** Simulate a guardian/teacher who blocked the bot or whose chat is gone. */
  readonly failingGuardianIds = new Set<string>();
  readonly failingTeacherIds = new Set<string>();

  reset(): void {
    this.guardianSends.length = 0;
    this.teacherSends.length = 0;
    this.failingGuardianIds.clear();
    this.failingTeacherIds.clear();
  }

  async send(
    guardianId: string,
    message: string,
    options?: SendOptions,
  ): Promise<SendResult> {
    this.guardianSends.push({ recipientId: guardianId, message, options });
    if (this.failingGuardianIds.has(guardianId)) {
      return { ok: false, reason: "blocked" };
    }
    return { ok: true };
  }

  async sendToTeacher(
    teacherId: string,
    message: string,
    options?: SendOptions,
  ): Promise<SendResult> {
    this.teacherSends.push({ recipientId: teacherId, message, options });
    if (this.failingTeacherIds.has(teacherId)) {
      return { ok: false, reason: "blocked" };
    }
    return { ok: true };
  }
}
