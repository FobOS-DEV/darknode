import { Bot } from "grammy";

import { registerHandlers } from "./bot/registerHandlers";
import { messages } from "./constants/messages";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./db/prisma";
import { startSubscriptionServer } from "./http/subscriptionServer";
import { bootstrapService } from "./services/bootstrapService";
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

  const subscriptionServer = startSubscriptionServer();

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, "Stopping bot");

    bot.stop();
    await new Promise<void>((resolve) => subscriptionServer.close(() => resolve()));
    await prisma.$disconnect();
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  try {
    const bootstrapResult = await bootstrapService.run();
    logger.info(bootstrapResult, "Bootstrap migration completed");
  } catch (error) {
    logger.error({ error }, "Bootstrap migration failed");
    throw error;
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
