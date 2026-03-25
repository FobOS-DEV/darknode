import { env } from "../config/env";

export function isAdminTelegramId(telegramId: bigint): boolean {
  return telegramId === env.adminTelegramId;
}

