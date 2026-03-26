import { Bot } from "grammy";

import { createContactKeyboard } from "./bot/keyboards/mainMenu";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./db/prisma";
import { reminderService } from "./services/reminderService";
import { userService } from "./services/userService";

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

  const reminders = await reminderService.listPendingExpiryReminders(env.reminderDays);

  logger.info(
    { configuredDays: env.reminderDays, pendingCount: reminders.length },
    "Prepared expiry reminders",
  );

  let sentCount = 0;

  for (const reminder of reminders) {
    const text = reminderService.formatExpiryReminderMessage({
      displayName: reminder.displayName,
      daysLeft: reminder.daysLeft,
      expiresAt: reminder.expiresAt,
      supportLink: env.supportLink,
    });

    try {
      await bot.api.sendMessage(reminder.telegramId, text, {
        reply_markup: createContactKeyboard(),
      });

      await reminderService.markExpiryReminderSent(
        actor.id,
        reminder.userId,
        reminder.daysLeft,
        reminder.expiresAt,
      );

      sentCount += 1;
    } catch (error) {
      logger.error(
        {
          error,
          telegramId: reminder.telegramId,
          userId: reminder.userId,
        },
        "Failed to send expiry reminder",
      );
    }
  }

  logger.info({ sentCount, pendingCount: reminders.length }, "Expiry reminder run completed");
}

main()
  .catch((error) => {
    logger.error({ error }, "Expiry reminder run failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
