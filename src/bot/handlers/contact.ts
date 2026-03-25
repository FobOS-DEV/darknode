import { messages } from "../../constants/messages";
import { TelegramBot } from "../../types/bot";
import { createContactKeyboard } from "../keyboards/mainMenu";

async function replyWithContact(ctx: any) {
  await ctx.reply(messages.contact, {
    reply_markup: createContactKeyboard(),
  });
}

export function registerContactHandler(bot: TelegramBot) {
  bot.command("contact", replyWithContact);
  bot.callbackQuery("main:contact", async (ctx) => {
    await ctx.answerCallbackQuery();
    await replyWithContact(ctx);
  });
}

