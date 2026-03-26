import { InputFile } from "grammy";

import { logger } from "../../config/logger";
import { messages } from "../../constants/messages";
import { qrCodeService } from "../../services/qrCodeService";
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

  try {
    const qrPng = await qrCodeService.generateConfigPng(access.client.vlessUrl);

    await ctx.replyWithPhoto(new InputFile(qrPng, "vpn-config-qr.png"), {
      caption: messages.configQrCaption,
    });
  } catch (error) {
    logger.warn({ error, telegramId: identity.telegramId }, "Failed to generate config QR");
  }
}

export function registerConfigHandler(bot: TelegramBot) {
  bot.command("config", replyWithConfig);
  bot.callbackQuery("main:config", async (ctx) => {
    await ctx.answerCallbackQuery();
    await replyWithConfig(ctx);
  });
}
