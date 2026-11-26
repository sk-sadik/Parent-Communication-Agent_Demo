import type { Bot } from "grammy";
import { getAiProvider, setAiLogger } from "./ai/runtime.js";
import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { createBot } from "./telegram/bot.js";
import { describeError } from "./telegram/errors.js";

const app = buildApp();

// AI logs never include the key or prompt text.
setAiLogger({
  info: (message) => app.log.info(message),
  warn: (message) => app.log.warn(message),
  error: (message) => app.log.error(message),
});

// Logs "AI disabled" once at startup when the key or model is missing. The bot
// still works: marks/progress questions use the Phase 3 template answer.
getAiProvider();

// The bot is optional: without a token the API still runs, so the health check
// and the database work in local development.
let bot: Bot | null = null;
if (env.TELEGRAM_BOT_TOKEN) {
  bot = createBot({ token: env.TELEGRAM_BOT_TOKEN, logger: app.log });
} else {
  app.log.warn(
    "Telegram bot disabled: TELEGRAM_BOT_TOKEN is not set. The HTTP server will still run.",
  );
}

async function shutdown(signal: string): Promise<void> {
  app.log.info(`Received ${signal}, shutting down`);
  try {
    if (bot) {
      // Stops long polling. This process is the only bot process.
      await bot.stop();
    }
    await app.close();
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });

  if (bot) {
    // Long polling in this single process. A rejected start (bad token or
    // network) is logged but never crashes the API server.
    void bot
      .start({
        onStart: (info) => {
          app.log.info(`Telegram bot started as @${info.username} (long polling)`);
        },
      })
      .catch((error) => {
        app.log.error(`Telegram bot polling stopped: ${describeError(error)}`);
      });
  }
} catch (error) {
  app.log.error(describeError(error));
  await prisma.$disconnect();
  process.exit(1);
}
