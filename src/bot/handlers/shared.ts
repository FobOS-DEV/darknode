import { BotContext } from "../../types/bot";

export function getTelegramIdentity(ctx: BotContext) {
  const from = ctx.from;

  if (!from) {
    return null;
  }

  return {
    telegramId: String(from.id),
    username: from.username,
    firstName: from.first_name,
    lastName: from.last_name,
    fullName: [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || String(from.id),
  };
}

