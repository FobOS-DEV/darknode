import { messages } from "../../constants/messages";
import { vpnService } from "../../services/vpnService";
import { TelegramBot } from "../../types/bot";
import { formatStatusMessage } from "../../utils/formatters";
import { createContactKeyboard } from "../keyboards/mainMenu";
import { getTelegramIdentity } from "./shared";

async function replyWithStatus(ctx: any) {
  const identity = getTelegramIdentity(ctx);

  if (!identity) {
    return;
  }

  const access = await vpnService.getUserAccessState(identity.telegramId);

  if (access.kind === "not_found") {
    await ctx.reply(messages.noAccess, {
      reply_markup: createContactKeyboard(),
    });
    return;
  }

  await ctx.reply(
    formatStatusMessage({
      displayName: access.client.displayName,
      status: access.client.status,
      createdAt: access.client.createdAt,
      expiresAt: access.client.expiresAt,
    }),
    access.kind === "inactive" ? { reply_markup: createContactKeyboard() } : undefined,
  );
}

export function registerStatusHandler(bot: TelegramBot) {
  bot.command("status", replyWithStatus);
  bot.callbackQuery("main:status", async (ctx) => {
    await ctx.answerCallbackQuery();
    await replyWithStatus(ctx);
  });
}

