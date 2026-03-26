import { Bot } from "grammy";

import { registerHandlers } from "./bot/registerHandlers";
import { messages } from "./constants/messages";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./db/prisma";
import { xraySyncService } from "./services/xraySyncService";
import { BotContext } from "./types/bot";

async function bootstrap() {
  const bot = new Bot<BotContext>(env.botToken);
  let isShuttingDown = false;

  logger.info("Starting bot polling");

  registerHandlers(bot);

  bot.catch((error) => {
    logger.error({ error }, "Telegram bot error");
    void error.ctx.reply(messages.unknownError).catch(() => undefined);
  });

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, "Stopping bot");

    bot.stop();
    await prisma.$disconnect();
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  if (xraySyncService.isEnabled()) {
    try {
      const syncResult = await xraySyncService.syncAuthorizedClients();
      logger.info(syncResult, "Initial Xray sync completed");
    } catch (error) {
      logger.error({ error }, "Initial Xray sync failed");
    }
  } else {
    logger.warn("Initial Xray sync skipped because SSH access is not configured");
  }

  await bot.start();
}

bootstrap().catch(async (error) => {
  logger.error({ error }, "Fatal startup error");
  await prisma.$disconnect();
  process.exitCode = 1;
});
