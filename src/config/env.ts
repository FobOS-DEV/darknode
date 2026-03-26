import { config as loadEnv } from "dotenv";

loadEnv();

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getOptionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function getReminderDays(): number[] {
  const rawValue = getOptionalEnv("REMINDER_DAYS", "7,3,1");

  const parsed = rawValue
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (parsed.length === 0) {
    throw new Error("REMINDER_DAYS must contain at least one positive integer");
  }

  return [...new Set(parsed)].sort((left, right) => right - left);
}

function getAdminTelegramId(): bigint {
  const rawValue = getRequiredEnv("ADMIN_TELEGRAM_ID");

  try {
    return BigInt(rawValue);
  } catch {
    throw new Error("ADMIN_TELEGRAM_ID must be a valid integer");
  }
}

export const env = {
  botToken: getRequiredEnv("BOT_TOKEN"),
  adminTelegramId: getAdminTelegramId(),
  adminUsername: getRequiredEnv("ADMIN_USERNAME"),
  databaseUrl: getOptionalEnv("DATABASE_URL", "file:./prisma/dev.db"),
  helpLink: getOptionalEnv(
    "HELP_LINK",
    "https://telegra.ph/Instrukciya-po-podklyucheniyu-03-25",
  ),
  reminderDays: getReminderDays(),
  timezone: getOptionalEnv("TZ", "UTC"),
  supportLink: getRequiredEnv("SUPPORT_LINK"),
};
