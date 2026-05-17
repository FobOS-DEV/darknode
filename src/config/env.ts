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

function getOptionalNullableEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value : null;
}

function getOptionalNumberEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be a valid integer`);
  }

  return parsed;
}

function getOptionalBooleanEnv(name: string, fallback: boolean): boolean {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const normalized = rawValue.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`${name} must be a boolean value`);
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
  vpnServerHost: getOptionalEnv("VPN_SERVER_HOST", "vpn.example.com"),
  vpnServerPort: getOptionalNumberEnv("VPN_SERVER_PORT", 443),
  vpnPublicKey: getOptionalEnv("VPN_PUBLIC_KEY", "change-me"),
  vpnSni: getOptionalEnv("VPN_SNI", "example.com"),
  vpnShortId: getOptionalEnv("VPN_SHORT_ID", "change-me"),
  vpnFlow: getOptionalEnv("VPN_FLOW", "xtls-rprx-vision"),
  vpnFingerprint: getOptionalEnv("VPN_FINGERPRINT", "chrome"),
  vpnDefaultExpiryDays: getOptionalNumberEnv("VPN_DEFAULT_EXPIRY_DAYS", 30),
  xraySyncEnabled: getOptionalBooleanEnv("XRAY_SYNC_ENABLED", false),
  xrayHotSyncEnabled: getOptionalBooleanEnv("XRAY_HOT_SYNC_ENABLED", false),
  sshHost: getOptionalNullableEnv("SSH_HOST"),
  sshPort: getOptionalNumberEnv("SSH_PORT", 22),
  sshUser: getOptionalNullableEnv("SSH_USER"),
  sshPassword: getOptionalNullableEnv("SSH_PASSWORD"),
  sshKeyPath: getOptionalNullableEnv("SSH_KEY_PATH"),
  xrayConfigPath: getOptionalEnv("XRAY_CONFIG_PATH", "/opt/xray-reality/config.json"),
  xrayContainerName: getOptionalEnv("XRAY_CONTAINER_NAME", "xray-reality"),
  xrayApiAddress: getOptionalNullableEnv("XRAY_API_ADDRESS"),
  xrayInboundTag: getOptionalEnv("XRAY_INBOUND_TAG", "vless-reality"),
  xrayAccessLogPath: getOptionalEnv("XRAY_ACCESS_LOG_PATH", "/var/log/xray/access.log"),
  sharingIpThreshold: getOptionalNumberEnv("SHARING_IP_THRESHOLD", 5),
  sharingDetectorWindowHours: getOptionalNumberEnv("SHARING_DETECTOR_WINDOW_HOURS", 24),
  subBaseUrl: getRequiredEnv("SUB_BASE_URL"),
  subHttpHost: getOptionalEnv("SUB_HTTP_HOST", "0.0.0.0"),
  subHttpPort: getOptionalNumberEnv("SUB_HTTP_PORT", 3001),
  resendApiKey: getOptionalNullableEnv("RESEND_API_KEY"),
  emailFrom: getOptionalNullableEnv("EMAIL_FROM"),
  smtpHost: getOptionalNullableEnv("SMTP_HOST"),
  smtpPort: getOptionalNumberEnv("SMTP_PORT", 587),
  smtpUser: getOptionalNullableEnv("SMTP_USER"),
  smtpPass: getOptionalNullableEnv("SMTP_PASS"),
  smtpSecure: getOptionalBooleanEnv("SMTP_SECURE", false),
  sessionTtlDays: getOptionalNumberEnv("SESSION_TTL_DAYS", 30),
  verificationTtlMinutes: getOptionalNumberEnv("VERIFICATION_TTL_MINUTES", 15),
  siteOrigin: getOptionalNullableEnv("SITE_ORIGIN"),
  subProfileTitle: (() => {
    const b64 = getOptionalNullableEnv("SUB_PROFILE_TITLE_BASE64");
    if (b64) {
      try {
        return Buffer.from(b64, "base64").toString("utf8");
      } catch {
        return null;
      }
    }
    return getOptionalNullableEnv("SUB_PROFILE_TITLE");
  })(),
  timezone: getOptionalEnv("TZ", "UTC"),
  supportLink: getRequiredEnv("SUPPORT_LINK"),
};
