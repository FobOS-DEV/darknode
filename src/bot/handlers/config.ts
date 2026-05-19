import { InputFile } from "grammy";

import { logger } from "../../config/logger";
import { messages } from "../../constants/messages";
import { qrCodeService } from "../../services/qrCodeService";
import { subscriptionService } from "../../services/subscriptionService";
import { vpnService } from "../../services/vpnService";
import { TelegramBot } from "../../types/bot";
import { formatDate } from "../../utils/dates";
import { createContactKeyboard } from "../keyboards/mainMenu";
import { getTelegramIdentity } from "./shared";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

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

  const subscription = await subscriptionService.ensureForUser(access.client.userId);
  const subscriptionUrl = subscriptionService.buildPublicUrl(subscription.token);
  const inbounds = await subscriptionService.listVisibleInboundsForUser(access.client.userId);

  const inboundLines = inbounds.length
    ? inbounds
        .map((inbound) => `• ${escapeHtml(inbound.label)} (<code>${escapeHtml(`${inbound.host}:${inbound.port}`)}</code>)`)
        .join("\n")
    : `<i>${escapeHtml(messages.configNoInbounds)}</i>`;

  const configCard = [
    `<b>${escapeHtml(access.client.displayName)}</b>`,
    messages.configIntro,
    "",
    `<b>Доступ до:</b> ${escapeHtml(formatDate(access.client.expiresAt))}`,
    `<b>Активных точек входа:</b> ${inbounds.length}`,
    inboundLines,
  ].join("\n");

  await ctx.reply(configCard, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });

  await ctx.reply(`<code>${escapeHtml(subscriptionUrl)}</code>`, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });

  try {
    const qrPng = await qrCodeService.generateConfigPng(subscriptionUrl);

    await ctx.replyWithPhoto(new InputFile(qrPng, "vpn-subscription-qr.png"), {
      caption: messages.configQrCaption,
    });
  } catch (error) {
    logger.warn({ error, telegramId: identity.telegramId }, "Failed to generate subscription QR");
  }
}

export function registerConfigHandler(bot: TelegramBot) {
  bot.command("config", replyWithConfig);
  bot.callbackQuery("main:config", async (ctx) => {
    await ctx.answerCallbackQuery();
    await replyWithConfig(ctx);
  });
}
