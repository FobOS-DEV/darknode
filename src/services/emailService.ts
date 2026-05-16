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

function logToConsole(input: SendInput): SendResult {
  logger.info(
    { to: input.to, subject: input.subject, textBody: input.textBody },
    "[email/dev] would have sent email (no provider configured)",
  );
  return { ok: true, provider: "console" };
}

export const emailService = {
  async send(input: SendInput): Promise<SendResult> {
    if (env.resendApiKey) {
      return sendViaResend(input);
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
