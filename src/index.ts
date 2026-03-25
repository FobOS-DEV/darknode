import { Bot } from "grammy";

import { registerHandlers } from "./bot/registerHandlers";
import { messages } from "./constants/messages";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./db/prisma";
import { BotContext } from "./types/bot";

async function bootstrap() {
  const bot = new Bot<BotContext>(env.botToken);

  logger.info("Starting bot polling");

  registerHandlers(bot);

  bot.catch((error) => {
    logger.error({ error }, "Telegram bot error");
    void error.ctx.reply(messages.unknownError).catch(() => undefined);
  });

  await bot.start();
  logger.info("Bot started");
}

bootstrap().catch(async (error) => {
  logger.error({ error }, "Fatal startup error");
  await prisma.$disconnect();
  process.exitCode = 1;
});
