import { messages } from "../../constants/messages";
import { env } from "../../config/env";
import { userService } from "../../services/userService";
import { vpnService } from "../../services/vpnService";
import { TelegramBot } from "../../types/bot";
import { createContactKeyboard, createMainMenuKeyboard } from "../keyboards/mainMenu";
import { getTelegramIdentity } from "./shared";

export function registerStartHandler(bot: TelegramBot) {
  bot.command("start", async (ctx) => {
    const identity = getTelegramIdentity(ctx);

    if (!identity) {
      return;
    }

    await userService.upsertUser(identity, BigInt(identity.telegramId) === env.adminTelegramId);

    const access = await vpnService.getUserAccessState(identity.telegramId);

    if (access.kind === "active") {
      await ctx.reply(messages.welcome, {
        reply_markup: createMainMenuKeyboard(),
      });
      return;
    }

    await ctx.reply(messages.noAccess, {
      reply_markup: createContactKeyboard(),
    });
  });
}
