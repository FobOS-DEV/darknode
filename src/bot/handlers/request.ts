import { logger } from "../../config/logger";
import { messages } from "../../constants/messages";
import { requestService } from "../../services/requestService";
import { TelegramBot } from "../../types/bot";
import { createRequestDecisionKeyboard } from "../keyboards/adminMenu";
import { createRequestAccessKeyboard } from "../keyboards/mainMenu";
import { getTelegramIdentity } from "./shared";

export function registerRequestHandler(bot: TelegramBot) {
  bot.callbackQuery("main:request_access", async (ctx) => {
    await ctx.answerCallbackQuery();

    const identity = getTelegramIdentity(ctx);

    if (!identity) {
      return;
    }

    const result = await requestService.submitAccessRequest(identity);

    await ctx.reply(
      result.created ? messages.requestSubmitted : messages.requestAlreadyPending,
      {
        reply_markup: createRequestAccessKeyboard(),
      },
    );

    if (!result.created) {
      return;
    }

    try {
      await ctx.api.sendMessage(
        Number(process.env.ADMIN_TELEGRAM_ID),
        [
          "Новая заявка на доступ.",
          `Имя: ${result.user.fullName}`,
          `Telegram ID: ${result.user.telegramId}`,
          `Username: ${result.user.username ?? "-"}`,
        ].join("\n"),
        {
          reply_markup: createRequestDecisionKeyboard(result.request.id),
        },
      );
    } catch (error) {
      logger.warn({ error, requestId: result.request.id }, "Failed to notify admin about new request");
    }
  });
}
