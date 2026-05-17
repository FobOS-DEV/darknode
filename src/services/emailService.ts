import { createTransport, type Transporter } from "nodemailer";

import { env } from "../config/env";
import { logger } from "../config/logger";

type SendInput = {
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
};

type SendResult =
  | { ok: true; provider: string; messageId?: string }
  | { ok: false; provider: string; error: string };

// ─── SMTP ────────────────────────────────────────────────────────────────────
let smtpTransporter: Transporter | null = null;

function isSmtpConfigured(): boolean {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPass && env.emailFrom);
}

function getSmtpTransporter(): Transporter {
  if (smtpTransporter) {
    return smtpTransporter;
  }
  smtpTransporter = createTransport({
    host: env.smtpHost!,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
      user: env.smtpUser!,
      pass: env.smtpPass!,
    },
  });
  return smtpTransporter;
}

async function sendViaSmtp(input: SendInput): Promise<SendResult> {
  if (!isSmtpConfigured()) {
    return { ok: false, provider: "smtp", error: "SMTP_HOST/USER/PASS/EMAIL_FROM not configured" };
  }
  try {
    const info = await getSmtpTransporter().sendMail({
      from: env.emailFrom!,
      to: input.to,
      subject: input.subject,
      text: input.textBody,
      html: input.htmlBody,
    });
    return { ok: true, provider: "smtp", messageId: info.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, provider: "smtp", error: message };
  }
}

// ─── Resend ──────────────────────────────────────────────────────────────────
async function sendViaResend(input: SendInput): Promise<SendResult> {
  if (!env.resendApiKey || !env.emailFrom) {
    return { ok: false, provider: "resend", error: "RESEND_API_KEY / EMAIL_FROM not configured" };
  }

  const body = {
    from: env.emailFrom,
    to: [input.to],
    subject: input.subject,
    text: input.textBody,
    html: input.htmlBody ?? undefined,
  };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, provider: "resend", error: `HTTP ${res.status}: ${errText}` };
    }

    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, provider: "resend", messageId: json.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, provider: "resend", error: message };
  }
}

// ─── Console fallback ────────────────────────────────────────────────────────
function logToConsole(input: SendInput): SendResult {
  logger.info(
    { to: input.to, subject: input.subject, textBody: input.textBody },
    "[email/dev] would have sent email (no provider configured)",
  );
  return { ok: true, provider: "console" };
}

// ─── Public API ──────────────────────────────────────────────────────────────
export const emailService = {
  async send(input: SendInput): Promise<SendResult> {
    // SMTP wins when explicitly configured — it's what an admin would set
    // after consciously picking Mail.ru / Yandex / etc. Resend is the default
    // when only an API key is around; console-log keeps dev environments happy.
    if (isSmtpConfigured()) {
      const result = await sendViaSmtp(input);
      if (!result.ok) {
        logger.warn({ provider: "smtp", error: result.error }, "SMTP send failed");
      }
      return result;
    }
    if (env.resendApiKey) {
      const result = await sendViaResend(input);
      if (!result.ok) {
        logger.warn({ provider: "resend", error: result.error }, "Resend send failed");
      }
      return result;
    }
    return logToConsole(input);
  },

  buildVerificationEmail(code: string): { subject: string; textBody: string; htmlBody: string } {
    const subject = `DarkNode · код подтверждения ${code}`;
    const textBody = [
      "Привет.",
      "",
      `Твой код подтверждения для DarkNode VPN: ${code}`,
      "",
      "Код действует 15 минут. Если ты не запрашивал регистрацию — просто удали это письмо.",
      "",
      "—",
      "DarkNode VPN",
    ].join("\n");
    const htmlBody = `<!doctype html>
<html><body style="font-family: ui-monospace, monospace; background: #050505; color: #e8e8e8; padding: 24px;">
  <div style="max-width: 520px; margin: 0 auto;">
    <div style="font-size: 11px; color: #888; letter-spacing: 0.15em; text-transform: uppercase;">// MAILBOX.HANDSHAKE</div>
    <h2 style="color: #00ff88; margin: 12px 0 24px;">🇸🇪 DarkNode VPN</h2>
    <p>Привет. Твой код подтверждения:</p>
    <div style="font-size: 32px; letter-spacing: 8px; color: #00ff88; margin: 16px 0; font-weight: 700;">${code}</div>
    <p style="color: #888;">Код действует 15 минут. Если ты не запрашивал регистрацию — просто удали это письмо.</p>
    <hr style="border: 0; border-top: 1px dashed rgba(255,255,255,0.1); margin: 24px 0;">
    <div style="font-size: 11px; color: #555;">— DarkNode VPN, ${new Date().getUTCFullYear()}</div>
  </div>
</body></html>`;
    return { subject, textBody, htmlBody };
  },
};
