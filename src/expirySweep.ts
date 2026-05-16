import { Bot } from "grammy";

import { createContactKeyboard } from "./bot/keyboards/mainMenu";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./db/prisma";
import { expirySweepService } from "./services/expirySweepService";
import { userService } from "./services/userService";
import { formatDate } from "./utils/dates";

function buildExpiredNotice(displayName: string, expiresAt: Date): string {
  return [
    `Доступ VPN для ${displayName} истёк ${formatDate(expiresAt)}.`,
    `Для продления напишите администратору: ${env.supportLink}`,
  ].join("\n");
}

async function main() {
  const bot = new Bot(env.botToken);
  const actor = await userService.upsertUser(
    {
      telegramId: env.adminTelegramId.toString(),
      username: env.adminUsername,
      fullName: env.adminUsername,
    },
    true,
  );

  const result = await expirySweepService.sweep(actor.id);

  let notifiedCount = 0;

  for (const client of result.expired) {
    try {
      await bot.api.sendMessage(
        client.telegramId,
        buildExpiredNotice(client.displayName, client.expiresAt),
        { reply_markup: createContactKeyboard() },
      );
      notifiedCount += 1;
    } catch (error) {
      logger.warn(
        { error, telegramId: client.telegramId, vpnClientId: client.vpnClientId },
        "Failed to notify user about expired access",
      );
    }
  }

  logger.info(
    { expiredCount: result.expired.length, notifiedCount, synced: result.synced },
    "Expiry sweep run finished",
  );
}

main()
  .catch((error) => {
    logger.error({ error }, "Expiry sweep run failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
