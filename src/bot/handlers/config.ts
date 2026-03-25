import { messages } from "../../constants/messages";
import { vpnService } from "../../services/vpnService";
import { TelegramBot } from "../../types/bot";
import { createContactKeyboard } from "../keyboards/mainMenu";
import { getTelegramIdentity } from "./shared";

async function replyWithConfig(ctx: any) {
  const identity = getTelegramIdentity(ctx);

  if (!identity) {
    return;
  }

  const access = await vpnService.getUserAccessState(identity.telegramId);

  if (access.kind !== "active") {
    await ctx.reply(access.kind === "not_found" ? messages.noAccess : messages.inactiveAccess, {
      reply_markup: createContactKeyboard(),
    });
    return;
  }

  await ctx.reply([
    access.client.displayName,
    messages.configIntro,
    "",
    access.client.vlessUrl,
  ].join("\n"));
}

export function registerConfigHandler(bot: TelegramBot) {
  bot.command("config", replyWithConfig);
  bot.callbackQuery("main:config", async (ctx) => {
    await ctx.answerCallbackQuery();
    await replyWithConfig(ctx);
  });
}

