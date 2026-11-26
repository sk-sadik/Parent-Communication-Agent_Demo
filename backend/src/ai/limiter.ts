// Free-tier protection for AI calls:
//   * a per-guardian daily limit (UTC day),
//   * a small global concurrency limit with a bounded queue.
//
// When a limit is hit the caller falls back to the Phase 3 template answer; no
// parent ever sees an error.

export class AiDailyLimitError extends Error {
  readonly code = "daily_limit";
}

export class AiQueueFullError extends Error {
  readonly code = "queue_full";
}

export interface AiLimiterOptions {
  dailyLimit: number;
  maxConcurrent?: number;
  maxQueue?: number;
  /** Injectable clock so the daily reset is testable. */
  now?: () => Date;
}

interface DailyCounter {
  day: string;
  count: number;
}

export class AiLimiter {
  private readonly dailyLimit: number;
  private readonly maxConcurrent: number;
  private readonly maxQueue: number;
  private readonly now: () => Date;

  private readonly counters = new Map<string, DailyCounter>();
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(options: AiLimiterOptions) {
    this.dailyLimit = options.dailyLimit;
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.maxQueue = options.maxQueue ?? 8;
    this.now = options.now ?? (() => new Date());
  }

  /** Counts one AI attempt for this guardian today. Returns false at the limit. */
  consumeDaily(guardianId: string): boolean {
    const day = this.now().toISOString().slice(0, 10);
    const counter = this.counters.get(guardianId);

    if (!counter || counter.day !== day) {
      this.counters.set(guardianId, { day, count: 1 });
      return true;
    }

    if (counter.count >= this.dailyLimit) return false;

    counter.count += 1;
    return true;
  }

  /** Remaining AI explanations for this guardian today. */
  remainingToday(guardianId: string): number {
    const day = this.now().toISOString().slice(0, 10);
    const counter = this.counters.get(guardianId);
    if (!counter || counter.day !== day) return this.dailyLimit;
    return Math.max(0, this.dailyLimit - counter.count);
  }

  /** Runs a task inside the concurrency limit. Throws AiQueueFullError when busy. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      if (this.waiting.length >= this.maxQueue) {
        throw new AiQueueFullError("AI queue is full");
      }
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
      });
    }

    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      const next = this.waiting.shift();
      if (next) next();
    }
  }
}
