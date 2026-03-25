import { messages } from "../../constants/messages";
import { TelegramBot } from "../../types/bot";

async function replyWithHelp(ctx: any) {
  await ctx.reply(messages.help);
}

export function registerHelpHandler(bot: TelegramBot) {
  bot.command("help", replyWithHelp);
  bot.callbackQuery("main:help", async (ctx) => {
    await ctx.answerCallbackQuery();
    await replyWithHelp(ctx);
  });
}

